import type { OddsProvider } from "../provider.js";
import type { ProviderEvent, ProviderOddsRow, MarketType, SelectionType } from "../oddsTypes.js";

type TheOddsApiEvent = {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  sport_title?: string;
};

type TheOddsApiOddsEvent = TheOddsApiEvent & {
  bookmakers: Array<{
    key: string;
    last_update: string;
    markets: Array<{
      key: "h2h" | "spreads" | "totals";
      outcomes: Array<{ name: string; price: number; point?: number }>;
    }>;
  }>;
};

function baseUrl() {
  return (process.env.ODDS_API_BASE_URL || "https://api.the-odds-api.com").replace(/\/+$/, "");
}

function apiKey() {
  const k = process.env.ODDS_API_KEY;
  if (!k) throw new Error("Missing ODDS_API_KEY");
  return k;
}

function mapMarket(key: "h2h" | "spreads" | "totals"): MarketType {
  if (key === "h2h") return "moneyline";
  if (key === "spreads") return "spread";
  return "total";
}

function mapSelection(
  market: MarketType,
  outcomeName: string,
  homeTeam: string,
  awayTeam: string
): SelectionType | null {
  if (market === "moneyline" || market === "spread") {
    if (outcomeName === homeTeam) return "home";
    if (outcomeName === awayTeam) return "away";
    return null;
  }
  const lower = outcomeName.toLowerCase();
  if (lower.startsWith("over")) return "over";
  if (lower.startsWith("under")) return "under";
  return null;
}

/**
 * NOTE:
 * This adapter assumes the provider returns American odds under outcome.price.
 * Many providers return decimal; adjust here if your provider differs.
 */
export const theOddsApiProvider: OddsProvider = {
  key: "theoddsapi",

  async fetchUpcomingEvents({ sportKey, limit }) {
    const url = new URL(`${baseUrl()}/v4/sports/${sportKey}/events`);
    url.searchParams.set("apiKey", apiKey());

    const res = await fetch(url.toString(), { method: "GET" });
    if (res.status === 429) {
      const text = await res.text();
      throw new Error(`ODDS_PROVIDER_RATE_LIMIT 429: ${text}`);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ODDS_PROVIDER_ERROR ${res.status}: ${text}`);
    }

    const data = (await res.json()) as TheOddsApiEvent[];
    const sliced = data
      .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime())
      .slice(0, limit);

    return sliced.map((e) => ({
      externalEventId: e.id,
      sportKey: e.sport_key,
      league: e.sport_title,
      homeTeam: e.home_team,
      awayTeam: e.away_team,
      startTime: e.commence_time,
    }));
  },

  async fetchEventOdds({ sportKey, externalEventIds }) {
    const url = new URL(`${baseUrl()}/v4/sports/${sportKey}/odds`);
    url.searchParams.set("apiKey", apiKey());
    url.searchParams.set("regions", "us");
    url.searchParams.set("oddsFormat", "american");
    url.searchParams.set("markets", "h2h,spreads,totals");

    const res = await fetch(url.toString(), { method: "GET" });
    if (res.status === 429) {
      const text = await res.text();
      throw new Error(`ODDS_PROVIDER_RATE_LIMIT 429: ${text}`);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ODDS_PROVIDER_ERROR ${res.status}: ${text}`);
    }

    const data = (await res.json()) as TheOddsApiOddsEvent[];
    const set = new Set(externalEventIds);
    const filtered = data.filter((e) => set.has(e.id));

    const rows: ProviderOddsRow[] = [];
    for (const ev of filtered) {
      for (const book of ev.bookmakers || []) {
        for (const m of book.markets || []) {
          const marketType = mapMarket(m.key);
          for (const outcome of m.outcomes || []) {
            const selection = mapSelection(marketType, outcome.name, ev.home_team, ev.away_team);
            if (!selection) continue;
            if (!Number.isFinite(outcome.price) || outcome.price === 0) continue;

            rows.push({
              externalEventId: ev.id,
              marketType,
              selection,
              bookKey: book.key,
              oddsAmerican: Math.trunc(outcome.price),
              lastUpdated: book.last_update || ev.commence_time,
            });
          }
        }
      }
    }

    return rows;
  },
};
