import { prisma } from "../prisma.js";

export type EngineeredFeatures = {
  chg_1h: number | null;
  chg_24h: number | null;
  chg_7d: number | null;
  vol_24h: number | null;
  vol_7d: number | null;
  volume_24h: number | null;
  volume_7d: number | null;
  snapshots_count_24h: number;
  snapshots_count_7d: number;
  reversal_risk: number; // 0-1 heuristic
  current_probability: number | null;
};

export type FeatureResult = {
  features: EngineeredFeatures;
  score: number; // 0-100
  confidence: "LOW" | "MED" | "HIGH";
  explanation: string;
};

const MS_1H = 60 * 60 * 1000;
const MS_24H = 24 * MS_1H;
const MS_7D = 7 * 24 * MS_1H;

/** Clamp and normalize probability to 0-1 */
function norm(p: number | null | undefined): number | null {
  if (p == null || !Number.isFinite(p)) return null;
  return Math.max(0, Math.min(1, p));
}

/** Find probability at closest snapshot to targetTime */
function probAt(snapshots: { ts: Date; probability: number | null }[], targetTime: Date): number | null {
  if (snapshots.length === 0) return null;
  let best: { ts: Date; probability: number | null } | null = null;
  let bestDiff = Infinity;
  for (const s of snapshots) {
    const diff = Math.abs(s.ts.getTime() - targetTime.getTime());
    if (diff < bestDiff && s.probability != null) {
      bestDiff = diff;
      best = s;
    }
  }
  return best ? norm(best.probability) : null;
}

/** Std dev of probability changes */
function volatility(probs: (number | null)[]): number | null {
  const valid = probs.filter((p): p is number => p != null && Number.isFinite(p));
  if (valid.length < 2) return null;
  const changes: number[] = [];
  for (let i = 1; i < valid.length; i++) {
    changes.push(valid[i]! - valid[i - 1]!);
  }
  const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
  const variance = changes.reduce((a, d) => a + (d - mean) ** 2, 0) / changes.length;
  return Math.sqrt(variance);
}

/** Volume delta: latest - oldest in window (proxy for traded volume) */
function volumeDelta(snapshots: { ts: Date; volume: number | null }[], now: Date, windowMs: number): number | null {
  const cutoff = new Date(now.getTime() - windowMs);
  const inWindow = snapshots.filter((s) => s.ts >= cutoff && s.ts <= now).sort((a, b) => a.ts.getTime() - b.ts.getTime());
  if (inWindow.length < 2) return null;
  const first = inWindow[0]!.volume;
  const last = inWindow[inWindow.length - 1]!.volume;
  if (first == null || last == null || !Number.isFinite(first) || !Number.isFinite(last)) return null;
  return Math.max(0, last - first);
}

export async function computeFeatures(marketId: string): Promise<FeatureResult> {
  const now = new Date();
  const cutoff7d = new Date(now.getTime() - MS_7D);

  const snapshots = await prisma.marketSnapshot.findMany({
    where: { marketId, ts: { gte: cutoff7d } },
    orderBy: { ts: "asc" },
    select: { ts: true, probability: true, volume: true },
  });

  if (snapshots.length === 0) {
    return {
      features: {
        chg_1h: null,
        chg_24h: null,
        chg_7d: null,
        vol_24h: null,
        vol_7d: null,
        volume_24h: null,
        volume_7d: null,
        snapshots_count_24h: 0,
        snapshots_count_7d: 0,
        reversal_risk: 0.5,
        current_probability: null,
      },
      score: 50,
      confidence: "LOW",
      explanation: "No snapshots available; cannot compute features.",
    };
  }

  const latest = snapshots[snapshots.length - 1]!;
  const currentProb = norm(latest.probability);

  const t1h = new Date(now.getTime() - MS_1H);
  const t24h = new Date(now.getTime() - MS_24H);
  const t7d = new Date(now.getTime() - MS_7D);

  const prob1h = probAt(snapshots, t1h);
  const prob24h = probAt(snapshots, t24h);
  const prob7d = probAt(snapshots, t7d);

  const chg_1h = currentProb != null && prob1h != null ? currentProb - prob1h : null;
  const chg_24h = currentProb != null && prob24h != null ? currentProb - prob24h : null;
  const chg_7d = currentProb != null && prob7d != null ? currentProb - prob7d : null;

  const snapshots24h = snapshots.filter((s) => s.ts >= t24h);
  const snapshots7d = snapshots;

  const probs24h = snapshots24h.map((s) => norm(s.probability));
  const probs7d = snapshots7d.map((s) => norm(s.probability));

  const vol_24h = volatility(probs24h);
  const vol_7d = volatility(probs7d);

  const volume_24h = volumeDelta(snapshots, now, MS_24H);
  const volume_7d = volumeDelta(snapshots, now, MS_7D);

  // reversal_risk: large move with low volume or few snapshots
  let reversal_risk = 0;
  if (chg_24h != null && Math.abs(chg_24h) > 0.1) {
    const volNorm = volume_24h != null && volume_24h > 0 ? Math.min(1, volume_24h / 10000) : 0;
    const countNorm = Math.min(1, snapshots24h.length / 10);
    reversal_risk = Math.min(1, (1 - volNorm) * 0.6 + (1 - countNorm) * 0.4);
  }

  const features: EngineeredFeatures = {
    chg_1h,
    chg_24h,
    chg_7d,
    vol_24h,
    vol_7d,
    volume_24h,
    volume_7d,
    snapshots_count_24h: snapshots24h.length,
    snapshots_count_7d: snapshots7d.length,
    reversal_risk,
    current_probability: currentProb,
  };

  const { score, confidence, explanation } = featuresToScore(features);
  return { features, score, confidence, explanation };
}

/** Pure function: features -> score. ML can replace this later. */
function featuresToScore(features: EngineeredFeatures): { score: number; confidence: "LOW" | "MED" | "HIGH"; explanation: string } {
  const { snapshots_count_24h, snapshots_count_7d, chg_24h, vol_24h, reversal_risk, current_probability } = features;

  let confidence: "LOW" | "MED" | "HIGH" = "LOW";
  if (snapshots_count_7d >= 20 && snapshots_count_24h >= 5) confidence = "HIGH";
  else if (snapshots_count_7d >= 5) confidence = "MED";

  let score = 50; // neutral baseline
  const parts: string[] = [];

  if (current_probability != null) {
    if (current_probability > 0.7) {
      score += 10;
      parts.push("high probability");
    } else if (current_probability < 0.3) {
      score -= 10;
      parts.push("low probability");
    }
  }

  if (chg_24h != null && Math.abs(chg_24h) > 0.05) {
    score += Math.sign(chg_24h) * 5;
    parts.push(`24h chg ${(chg_24h * 100).toFixed(1)}%`);
  }

  if (vol_24h != null && vol_24h > 0.05) {
    score -= 5;
    parts.push(`high volatility`);
  }

  if (reversal_risk > 0.5) {
    score -= 10;
    parts.push("elevated reversal risk");
  }

  if (confidence === "HIGH") score += 5;
  else if (confidence === "LOW") score -= 5;

  score = Math.max(0, Math.min(100, score));
  const explanation = parts.length > 0 ? parts.join("; ") : "insufficient data";
  return { score, confidence, explanation };
}
