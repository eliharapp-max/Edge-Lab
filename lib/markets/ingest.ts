import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import type { NormalizedMarket, IngestResult } from "./types.js";
import { fetchMarkets as fetchPolymarket } from "./sources/polymarket.js";
import { fetchMarkets as fetchKalshi } from "./sources/kalshi.js";

export function toJsonInput(obj: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Prisma.InputJsonObject;
}

const LIMIT_PER_SOURCE = 100;

async function ingestSource(
  source: "POLYMARKET" | "KALSHI",
  fetchFn: () => Promise<NormalizedMarket[]>
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  try {
    const markets = await fetchFn();
    const ts = new Date();

    for (const m of markets) {
      try {
        const market = await prisma.market.upsert({
          where: { source_externalId: { source, externalId: m.externalId } },
          create: {
            source,
            externalId: m.externalId,
            title: m.title,
            url: m.url ?? null,
            category: m.category ?? null,
            status: m.status ?? "active",
          },
          update: {
            title: m.title,
            url: m.url ?? null,
            category: m.category ?? null,
            status: m.status ?? "active",
            updatedAt: ts,
          },
        });

        await prisma.marketSnapshot.create({
          data: {
            marketId: market.id,
            ts,
            probability: m.probability ?? null,
            priceYes: m.priceYes ?? null,
            priceNo: m.priceNo ?? null,
            volume: m.volume ?? null,
            liquidity: m.liquidity ?? null,
            spread: m.spread ?? null,
            raw: m.raw ? toJsonInput(m.raw) : undefined,
          },
        });
        count++;
      } catch (e) {
        errors.push(`${source} ${m.externalId}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    errors.push(`${source} fetch failed: ${(e as Error).message}`);
  }

  return { count, errors };
}

export async function ingestAll(): Promise<IngestResult> {
  const errors: string[] = [];
  let polyCount = 0;
  let kalshiCount = 0;

  const [polyResult, kalshiResult] = await Promise.all([
    ingestSource("POLYMARKET", () => fetchPolymarket(LIMIT_PER_SOURCE)),
    ingestSource("KALSHI", () => fetchKalshi(LIMIT_PER_SOURCE)),
  ]);

  polyCount = polyResult.count;
  kalshiCount = kalshiResult.count;
  errors.push(...polyResult.errors, ...kalshiResult.errors);

  return {
    success: polyCount + kalshiCount > 0,
    totalProcessed: polyCount + kalshiCount,
    bySource: { POLYMARKET: polyCount, KALSHI: kalshiCount },
    errors: errors.length > 0 ? errors : undefined,
  };
}

export async function ingestPolymarket(): Promise<IngestResult> {
  const { count, errors } = await ingestSource("POLYMARKET", () =>
    fetchPolymarket(LIMIT_PER_SOURCE)
  );
  return {
    success: count > 0,
    totalProcessed: count,
    bySource: { POLYMARKET: count, KALSHI: 0 },
    errors: errors.length > 0 ? errors : undefined,
  };
}

export async function ingestKalshi(): Promise<IngestResult> {
  const { count, errors } = await ingestSource("KALSHI", () =>
    fetchKalshi(LIMIT_PER_SOURCE)
  );
  return {
    success: count > 0,
    totalProcessed: count,
    bySource: { POLYMARKET: 0, KALSHI: count },
    errors: errors.length > 0 ? errors : undefined,
  };
}
