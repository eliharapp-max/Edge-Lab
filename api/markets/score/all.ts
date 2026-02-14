import { scoreAllMarkets } from "../../../lib/markets/score.js";

export default async function handler(
  req: { method?: string },
  res: { status: (n: number) => { json: (d: unknown) => void } }
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const result = await scoreAllMarkets({ activeOnly: true });
    return res.status(200).json(result);
  } catch (e) {
    console.error("[score/all] error:", e);
    return res.status(500).json({
      success: false,
      marketsScored: 0,
      errors: [(e as Error).message],
    });
  }
}
