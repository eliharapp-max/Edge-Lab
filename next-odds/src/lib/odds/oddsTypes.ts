export type MarketType = "moneyline" | "spread" | "total";
export type SelectionType = "home" | "away" | "over" | "under";

export type ProviderEvent = {
  externalEventId: string;
  sportKey: string;
  league?: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
};

export type ProviderOddsRow = {
  externalEventId: string;
  marketType: MarketType;
  selection: SelectionType;
  bookKey: string;
  oddsAmerican: number;
  lastUpdated: string;
};

export type OddsTableRow = {
  bookKey: string;
  oddsAmerican: number;
  oddsDecimal: number;
  lastUpdated: string;
  isBest: boolean;
};
