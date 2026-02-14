import { ingestPolymarket } from "../../../lib/markets/ingest.js";

export default async function handler(req: { method?: string }, res: { status: (n: number) => { json: (d: unknown) => void } }) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const result = await ingestPolymarket();
    return res.status(200).json(result);
  } catch (e) {
    console.error("[ingest/polymarket] error:", e);
    return res.status(500).json({
      success: false,
      totalProcessed: 0,
      bySource: { POLYMARKET: 0, KALSHI: 0 },
      error: (e as Error).message,
    });
  }
}
