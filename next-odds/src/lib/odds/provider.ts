import type { ProviderEvent, ProviderOddsRow } from "./oddsTypes.js";

export type OddsProvider = {
  key: string;
  fetchUpcomingEvents(params: { sportKey: string; limit: number }): Promise<ProviderEvent[]>;
  fetchEventOdds(params: { sportKey: string; externalEventIds: string[] }): Promise<ProviderOddsRow[]>;
};

export function getProviderKey() {
  return (process.env.ODDS_PROVIDER || "theoddsapi").toLowerCase();
}
