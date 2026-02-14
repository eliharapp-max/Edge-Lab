import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { computeFeatures } from "./features.js";

const asJson = (v: unknown) => v as Prisma.InputJsonValue;
const SIGNAL_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

export type ScoreAllResult = {
  success: boolean;
  marketsScored: number;
  errors: string[];
};

async function hasRecentSignal(marketId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - SIGNAL_COOLDOWN_MS);
  const recent = await prisma.marketSignal.findFirst({
    where: { marketId, ts: { gte: cutoff } },
  });
  return recent != null;
}

export async function scoreAllMarkets(options?: { activeOnly?: boolean }): Promise<ScoreAllResult> {
  const errors: string[] = [];
  let marketsScored = 0;

  const where = options?.activeOnly !== false ? { status: "active" } : {};
  const markets = await prisma.market.findMany({
    where,
    select: { id: true },
  });

  const ts = new Date();

  for (const market of markets) {
    try {
      const skip = await hasRecentSignal(market.id);
      if (skip) continue;

      const { features, score, confidence, explanation } = await computeFeatures(market.id);

      await prisma.marketSignal.create({
        data: {
          marketId: market.id,
          ts,
          score,
          confidence,
          explanation,
          features: asJson(features),
        },
      });
      marketsScored++;
    } catch (e) {
      errors.push(`${market.id}: ${(e as Error).message}`);
    }
  }

  return {
    success: marketsScored > 0,
    marketsScored,
    errors,
  };
}
