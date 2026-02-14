"use client";

import { useEffect, useMemo, useState } from "react";
import OddsTable from "./OddsTable.js";

type EventRow = {
  id: string;
  sportKey: string;
  league?: string | null;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
};

const SPORT_PRESETS = [
  { key: "basketball_nba", label: "NBA" },
  { key: "americanfootball_nfl", label: "NFL" },
  { key: "baseball_mlb", label: "MLB" },
  { key: "icehockey_nhl", label: "NHL" },
];

const MARKET_TYPES = [
  { key: "moneyline", label: "Moneyline" },
  { key: "spread", label: "Spread" },
  { key: "total", label: "Total" },
] as const;

const SELECTIONS = [
  { key: "home", label: "Home" },
  { key: "away", label: "Away" },
  { key: "over", label: "Over" },
  { key: "under", label: "Under" },
] as const;

export default function OddsClient() {
  const [sportKey, setSportKey] = useState<string>(SPORT_PRESETS[0].key);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [marketType, setMarketType] = useState<string>("moneyline");
  const [selection, setSelection] = useState<string>("home");
  const [search, setSearch] = useState<string>("");
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [warning, setWarning] = useState<string>("");

  async function loadEvents(refresh = false) {
    setLoadingEvents(true);
    try {
      const res = await fetch(
        `/api/odds/events?sportKey=${encodeURIComponent(sportKey)}&refresh=${refresh ? "1" : "0"}`
      );
      const data = await res.json();
      setEvents(data.events || []);
      setWarning(data.warning || "");
      if (!eventId && data.events?.[0]?.id) setEventId(data.events[0].id);
    } finally {
      setLoadingEvents(false);
    }
  }

  useEffect(() => {
    setEventId("");
    loadEvents(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportKey]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => {
      const t = `${e.homeTeam} ${e.awayTeam} ${e.league || ""}`.toLowerCase();
      return t.includes(q);
    });
  }, [events, search]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label className="text-xs font-medium text-gray-700">Sport</label>
          <select
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            value={sportKey}
            onChange={(e) => setSportKey(e.target.value)}
          >
            {SPORT_PRESETS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-medium text-gray-700">Search events</label>
          <input
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            placeholder="Type team name (e.g., Lakers)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-end">
          <button
            className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-60"
            onClick={() => loadEvents(true)}
            disabled={loadingEvents}
          >
            {loadingEvents ? "Refreshing…" : "Refresh Odds Data"}
          </button>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-medium text-gray-700">Event</label>
          <select
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          >
            {filteredEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.awayTeam} @ {ev.homeTeam} — {new Date(ev.startTime).toLocaleString()}
              </option>
            ))}
          </select>
          <div className="mt-1 text-xs text-gray-500">
            {filteredEvents.length ? `${filteredEvents.length} events` : "No events found."}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700">Market</label>
          <select
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            value={marketType}
            onChange={(e) => setMarketType(e.target.value)}
          >
            {MARKET_TYPES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-700">Selection</label>
          <select
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
          >
            {SELECTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">Moneyline/Spread use Home/Away. Totals use Over/Under.</p>
        </div>
      </div>

      {warning && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {warning}
        </div>
      )}

      <div className="mt-6">
        <OddsTable eventId={eventId} marketType={marketType} selection={selection} />
      </div>
    </div>
  );
}
