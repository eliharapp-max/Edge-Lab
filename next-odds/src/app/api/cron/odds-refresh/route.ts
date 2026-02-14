import { NextResponse } from "next/server";
import { refreshTrackedOdds } from "@/lib/odds/sync";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshTrackedOdds();
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    const msg = e?.message || String(e);

    if (msg.includes("ODDS_PROVIDER_RATE_LIMIT") || msg.includes("429")) {
      return NextResponse.json({ ok: false, rateLimited: true, error: msg }, { status: 429 });
    }

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
