import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pickBestOdds } from "@/lib/odds/bestOdds";
import { minutesBetween } from "@/lib/time";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const marketType = searchParams.get("marketType");
  const selection = searchParams.get("selection");

  if (!eventId || !marketType || !selection) {
    return NextResponse.json({ error: "Missing eventId, marketType, or selection" }, { status: 400 });
  }

  const staleMinutes = Number(process.env.ODDS_STALE_MINUTES || 5);

  const rows = await prisma.marketOdds.findMany({
    where: { eventId, marketType: marketType as any, selection: selection as any },
    orderBy: { oddsDecimal: "desc" },
    select: {
      bookKey: true,
      oddsAmerican: true,
      oddsDecimal: true,
      lastUpdated: true,
    },
  });

  const best = pickBestOdds(
    rows.map((r) => ({
      bookKey: r.bookKey,
      oddsAmerican: r.oddsAmerican,
      lastUpdated: r.lastUpdated.toISOString(),
    }))
  );

  const now = new Date();
  const newest = rows.reduce<Date | null>((acc, r) => {
    if (!acc) return r.lastUpdated;
    return r.lastUpdated > acc ? r.lastUpdated : acc;
  }, null);

  const isStale = !newest ? true : minutesBetween(now, newest) > staleMinutes;

  const table = rows.map((r) => ({
    bookKey: r.bookKey,
    oddsAmerican: r.oddsAmerican,
    oddsDecimal: r.oddsDecimal,
    lastUpdated: r.lastUpdated.toISOString(),
    isBest: best ? r.bookKey === best.bookKey && r.oddsAmerican === best.oddsAmerican : false,
  }));

  return NextResponse.json({
    table,
    best,
    isStale,
    newestUpdatedAt: newest?.toISOString() || null,
    staleMinutes,
  });
}
