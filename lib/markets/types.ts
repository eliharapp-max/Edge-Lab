export type NormalizedMarket = {
  source: "POLYMARKET" | "KALSHI";
  externalId: string;
  title: string;
  url?: string | null;
  category?: string | null;
  status: string;
  probability?: number | null;
  priceYes?: number | null;
  priceNo?: number | null;
  volume?: number | null;
  liquidity?: number | null;
  spread?: number | null;
  raw?: Record<string, unknown> | null;
};

export type IngestResult = {
  success: boolean;
  totalProcessed: number;
  bySource: { POLYMARKET: number; KALSHI: number };
  errors?: string[];
};
