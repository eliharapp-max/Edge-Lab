import { prisma } from "@/lib/prisma";
import { americanToDecimal } from "./oddsMath.js";
import { getProviderKey } from "./provider.js";
import { theOddsApiProvider } from "./providers/theOddsApi.js";

function getProvider() {
  const key = getProviderKey();
  if (key === "theoddsapi") return theOddsApiProvider;
  return theOddsApiProvider;
}

export async function syncUpcomingEventsAndOdds(params: { sportKey: string; limit?: number }) {
  const provider = getProvider();
  const limit = params.limit ?? 50;

  const events = await provider.fetchUpcomingEvents({ sportKey: params.sportKey, limit });

  for (const e of events) {
    await prisma.sportEvent.upsert({
      where: { externalEventId: e.externalEventId },
      create: {
        externalEventId: e.externalEventId,
        sportKey: e.sportKey,
        league: e.league,
        homeTeam: e.homeTeam,
        awayTeam: e.awayTeam,
        startTime: new Date(e.startTime),
      },
      update: {
        sportKey: e.sportKey,
        league: e.league,
        homeTeam: e.homeTeam,
        awayTeam: e.awayTeam,
        startTime: new Date(e.startTime),
      },
    });
  }

  const oddsRows = await provider.fetchEventOdds({
    sportKey: params.sportKey,
    externalEventIds: events.map((e) => e.externalEventId),
  });

  const dbEvents = await prisma.sportEvent.findMany({
    where: { externalEventId: { in: events.map((e) => e.externalEventId) } },
    select: { id: true, externalEventId: true },
  });
  const idMap = new Map(dbEvents.map((d) => [d.externalEventId, d.id]));

  for (const row of oddsRows) {
    const eventId = idMap.get(row.externalEventId);
    if (!eventId) continue;
    const oddsDecimal = americanToDecimal(row.oddsAmerican);

    await prisma.marketOdds.upsert({
      where: {
        eventId_marketType_selection_bookKey: {
          eventId,
          marketType: row.marketType,
          selection: row.selection,
          bookKey: row.bookKey,
        },
      },
      create: {
        eventId,
        marketType: row.marketType,
        selection: row.selection,
        bookKey: row.bookKey,
        oddsAmerican: row.oddsAmerican,
        oddsDecimal,
        lastUpdated: new Date(row.lastUpdated),
      },
      update: {
        oddsAmerican: row.oddsAmerican,
        oddsDecimal,
        lastUpdated: new Date(row.lastUpdated),
      },
    });
  }

  return { eventsUpserted: events.length, oddsUpserted: oddsRows.length };
}

export async function refreshTrackedOdds(params?: { maxEvents?: number }) {
  const maxEvents = params?.maxEvents ?? Number(process.env.ODDS_REFRESH_MAX_EVENTS || 50);

  const tracked = await prisma.trackedPick.findMany({
    take: maxEvents,
    include: { event: true },
    orderBy: { createdAt: "desc" },
  });

  const groups = new Map<string, string[]>();
  for (const t of tracked) {
    const sportKey = t.event.sportKey;
    if (!groups.has(sportKey)) groups.set(sportKey, []);
    groups.get(sportKey)!.push(t.event.externalEventId);
  }

  let totalOdds = 0;
  for (const [sportKey, externalEventIds] of groups.entries()) {
    const provider = getProvider();
    const oddsRows = await provider.fetchEventOdds({ sportKey, externalEventIds });

    const dbEvents = await prisma.sportEvent.findMany({
      where: { externalEventId: { in: externalEventIds } },
      select: { id: true, externalEventId: true },
    });
    const idMap = new Map(dbEvents.map((d) => [d.externalEventId, d.id]));

    for (const row of oddsRows) {
      const eventId = idMap.get(row.externalEventId);
      if (!eventId) continue;
      const oddsDecimal = americanToDecimal(row.oddsAmerican);

      await prisma.marketOdds.upsert({
        where: {
          eventId_marketType_selection_bookKey: {
            eventId,
            marketType: row.marketType,
            selection: row.selection,
            bookKey: row.bookKey,
          },
        },
        create: {
          eventId,
          marketType: row.marketType,
          selection: row.selection,
          bookKey: row.bookKey,
          oddsAmerican: row.oddsAmerican,
          oddsDecimal,
          lastUpdated: new Date(row.lastUpdated),
        },
        update: {
          oddsAmerican: row.oddsAmerican,
          oddsDecimal,
          lastUpdated: new Date(row.lastUpdated),
        },
      });
      totalOdds++;
    }
  }

  return { trackedPicks: tracked.length, oddsUpserted: totalOdds };
}
