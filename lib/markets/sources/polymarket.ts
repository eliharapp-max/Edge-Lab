import type { NormalizedMarket } from "../types.js";

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const POLYMARKET_BASE = "https://polymarket.com";

type PolymarketEvent = {
  id: string;
  slug: string;
  title: string;
  tags?: Array<{ slug?: string; label?: string }>;
  markets?: PolymarketMarket[];
  liquidity?: number;
  volume?: number;
};

type PolymarketMarket = {
  id: string;
  question: string;
  slug: string;
  outcomePrices?: string;
  outcomes?: string;
  volume?: string | number;
  volumeNum?: number;
  liquidityNum?: number;
  liquidityClob?: number;
  spread?: number;
  bestBid?: number;
  bestAsk?: number;
  active?: boolean;
  closed?: boolean;
};

function parseOutcomePrices(outcomePrices?: string, outcomes?: string): { yes: number; no: number } | null {
  if (!outcomePrices) return null;
  try {
    const prices = JSON.parse(outcomePrices) as string[];
    const outcomeNames = outcomes ? (JSON.parse(outcomes) as string[]) : ["Yes", "No"];
    const yesIdx = outcomeNames.findIndex((s) => s.toLowerCase() === "yes");
    const noIdx = outcomeNames.findIndex((s) => s.toLowerCase() === "no");
    const yes = yesIdx >= 0 ? parseFloat(prices[yesIdx]) : parseFloat(prices[0]);
    const no = noIdx >= 0 ? parseFloat(prices[noIdx]) : parseFloat(prices[1] ?? prices[0]);
    return { yes: Number.isFinite(yes) ? yes : 0, no: Number.isFinite(no) ? no : 0 };
  } catch {
    return null;
  }
}

export async function fetchMarkets(limit = 100): Promise<NormalizedMarket[]> {
  const results: NormalizedMarket[] = [];
  let offset = 0;
  const pageSize = 50;

  while (results.length < limit) {
    const url = `${GAMMA_BASE}/events?active=true&closed=false&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Polymarket API error: ${res.status} ${res.statusText}`);
    }
    const events = (await res.json()) as PolymarketEvent[];
    if (events.length === 0) break;

    for (const event of events) {
      const category = event.tags?.[0]?.label ?? event.tags?.[0]?.slug ?? null;
      if (!event.markets?.length) continue;

      for (const m of event.markets) {
        if (results.length >= limit) break;
        if (m.closed && !m.active) continue;

        const prices = parseOutcomePrices(m.outcomePrices, m.outcomes);
        const volume = typeof m.volume === "number" ? m.volume : m.volumeNum ?? (m.volume ? parseFloat(String(m.volume)) : undefined);
        const liquidity = m.liquidityNum ?? m.liquidityClob ?? undefined;

        results.push({
          source: "POLYMARKET",
          externalId: m.id,
          title: m.question || event.title,
          url: `${POLYMARKET_BASE}/event/${event.slug}`,
          category,
          status: m.closed ? "closed" : m.active ? "active" : "inactive",
          probability: prices ? prices.yes : undefined,
          priceYes: prices?.yes,
          priceNo: prices?.no,
          volume,
          liquidity,
          spread: m.spread,
          raw: m as unknown as Record<string, unknown>,
        });
      }
      if (results.length >= limit) break;
    }

    offset += pageSize;
    if (events.length < pageSize) break;
  }

  return results.slice(0, limit);
}
