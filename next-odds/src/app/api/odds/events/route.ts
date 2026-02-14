import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncUpcomingEventsAndOdds } from "@/lib/odds/sync";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sportKey = searchParams.get("sportKey") || "basketball_nba";
  const refresh = searchParams.get("refresh") === "1";
  let warning: string | null = null;

  try {
    if (refresh) {
      try {
        await syncUpcomingEventsAndOdds({ sportKey, limit: 50 });
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.warn("events refresh failed", msg);
        if (msg.includes("ODDS_PROVIDER_RATE_LIMIT") || msg.includes("429")) {
          warning = "Rate limited by odds provider. Showing cached data.";
        }
      }
    }

    const now = new Date();
    const events = await prisma.sportEvent.findMany({
      where: { sportKey, startTime: { gte: now } },
      orderBy: { startTime: "asc" },
      take: 100,
      select: {
        id: true,
        sportKey: true,
        league: true,
        homeTeam: true,
        awayTeam: true,
        startTime: true,
        externalEventId: true,
      },
    });

    return NextResponse.json({ events, warning });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load events" }, { status: 500 });
  }
}
