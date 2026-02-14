"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  bookKey: string;
  oddsAmerican: number;
  oddsDecimal: number;
  lastUpdated: string;
  isBest: boolean;
};

export default function OddsTable(props: { eventId: string; marketType: string; selection: string }) {
  const { eventId, marketType, selection } = props;

  const [rows, setRows] = useState<Row[]>([]);
  const [best, setBest] = useState<any>(null);
  const [isStale, setIsStale] = useState(false);
  const [newestUpdatedAt, setNewestUpdatedAt] = useState<string | null>(null);
  const [staleMinutes, setStaleMinutes] = useState<number>(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  async function load() {
    if (!eventId) return;
    setLoading(true);
    setError("");
    try {
      const url = `/api/odds/table?eventId=${encodeURIComponent(eventId)}&marketType=${encodeURIComponent(
        marketType
      )}&selection=${encodeURIComponent(selection)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load odds table");
      setRows(data.table || []);
      setBest(data.best || null);
      setIsStale(Boolean(data.isStale));
      setNewestUpdatedAt(data.newestUpdatedAt || null);
      setStaleMinutes(data.staleMinutes || 5);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, marketType, selection]);

  const header = useMemo(() => {
    const m = marketType === "moneyline" ? "ML" : marketType === "spread" ? "Spread" : "Total";
    const s = selection.toUpperCase();
    return `${m} • ${s}`;
  }, [marketType, selection]);

  async function copyBet(row: Row) {
    const time = new Date(row.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const text = `Book: ${row.bookKey} | ${header} | ${row.oddsAmerican > 0 ? "+" : ""}${row.oddsAmerican} | Updated: ${time}`;
    await navigator.clipboard.writeText(text);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Odds Table</div>
          <div className="text-xs text-gray-500">{header}</div>
        </div>
        <div className="flex items-center gap-2">
          {newestUpdatedAt && (
            <div className="text-xs text-gray-500">
              Updated: {new Date(newestUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
          <button
            onClick={load}
            className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {isStale && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Stale data: latest update is older than {staleMinutes} minutes. Odds may be out of date.
        </div>
      )}

      {error && <div className="px-4 py-3 text-sm text-red-600">{error}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-4 py-3">Book</th>
              <th className="px-4 py-3">American</th>
              <th className="px-4 py-3">Decimal</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-gray-500" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((r) => (
                <tr key={r.bookKey} className={r.isBest ? "bg-emerald-50" : ""}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {r.bookKey}
                    {r.isBest && <span className="ml-2 rounded bg-emerald-600 px-2 py-0.5 text-xs text-white">Best</span>}
                  </td>
                  <td className="px-4 py-3">{r.oddsAmerican > 0 ? `+${r.oddsAmerican}` : r.oddsAmerican}</td>
                  <td className="px-4 py-3">{r.oddsDecimal.toFixed(3)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(r.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => copyBet(r)}
                      className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50"
                    >
                      Copy bet
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-4 text-gray-500" colSpan={5}>
                  No odds found for this selection. Try Refresh Odds Data on top or choose another selection.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {best && (
        <div className="border-t border-gray-200 px-4 py-3 text-xs text-gray-600">
          Best payout currently: <span className="font-semibold text-gray-900">{best.bookKey}</span> at{" "}
          <span className="font-semibold text-gray-900">
            {best.oddsAmerican > 0 ? "+" : ""}
            {best.oddsAmerican}
          </span>
          .
        </div>
      )}
    </div>
  );
}
