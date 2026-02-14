import { scoreAllMarkets } from "../../lib/markets/score.js";

export default async function handler(
  req: { method?: string; headers?: { authorization?: string } },
  res: { status: (n: number) => { json: (d: unknown) => void } }
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const auth = req.headers?.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (process.env.CRON_SECRET && token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await scoreAllMarkets({ activeOnly: true });
    return res.status(200).json(result);
  } catch (e) {
    console.error("[cron/markets-score] error:", e);
    return res.status(500).json({
      success: false,
      marketsScored: 0,
      errors: [(e as Error).message],
    });
  }
}
