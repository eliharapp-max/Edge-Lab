import type { NormalizedMarket } from "../types.js";

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const KALSHI_WEB = "https://kalshi.com";

type KalshiMarket = {
  ticker: string;
  title: string;
  subtitle?: string;
  status?: string;
  last_price?: number;
  last_price_dollars?: string;
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  volume?: number;
  volume_24h?: number;
  volume_fp?: string;
  liquidity?: number;
  liquidity_dollars?: string;
  event_ticker?: string;
  close_time?: string;
};

type KalshiResponse = {
  markets: KalshiMarket[];
  cursor?: string;
};

function toDecimal(centPrice: number | undefined): number | undefined {
  if (centPrice == null || !Number.isFinite(centPrice)) return undefined;
  return centPrice / 100;
}

export async function fetchMarkets(limit = 100): Promise<NormalizedMarket[]> {
  const results: NormalizedMarket[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${KALSHI_BASE}/markets`);
    url.searchParams.set("status", "open");
    url.searchParams.set("limit", String(Math.min(limit - results.length, 200)));
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Kalshi API error: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as KalshiResponse;
    const markets = data.markets ?? [];
    if (markets.length === 0) break;

    for (const m of markets) {
      if (results.length >= limit) break;

      const lastPrice = m.last_price != null ? toDecimal(m.last_price) : m.last_price_dollars != null ? parseFloat(m.last_price_dollars) : undefined;
      const yesBid = toDecimal(m.yes_bid);
      const yesAsk = toDecimal(m.yes_ask);
      const noBid = toDecimal(m.no_bid);
      const noAsk = toDecimal(m.no_ask);
      const volume = m.volume ?? (m.volume_fp != null ? parseFloat(m.volume_fp) : undefined);
      const liquidity = m.liquidity ?? (m.liquidity_dollars != null ? parseFloat(m.liquidity_dollars) : undefined);
      const spread = (yesBid != null && yesAsk != null) ? yesAsk - yesBid : undefined;

      results.push({
        source: "KALSHI",
        externalId: m.ticker,
        title: m.title || m.subtitle || m.ticker,
        url: `${KALSHI_WEB}/markets/${m.event_ticker ?? m.ticker}`,
        category: null,
        status: m.status ?? "active",
        probability: lastPrice,
        priceYes: lastPrice ?? yesBid ?? yesAsk,
        priceNo: noBid ?? noAsk ?? (lastPrice != null ? 1 - lastPrice : undefined),
        volume,
        liquidity,
        spread,
        raw: m as unknown as Record<string, unknown>,
      });
    }

    cursor = data.cursor;
  } while (cursor && results.length < limit);

  return results.slice(0, limit);
}
