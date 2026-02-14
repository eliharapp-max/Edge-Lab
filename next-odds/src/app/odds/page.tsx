import OddsClient from "./OddsClient.js";

export const metadata = {
  title: "Best Odds",
};

export default async function OddsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Best Odds</h1>
            <p className="mt-1 text-sm text-gray-600">
              Compare sportsbook payouts for a pick. Best value = best payout odds only.
            </p>
          </div>
          <div className="text-xs text-gray-500">Powered by your configured odds provider</div>
        </div>

        <div className="mt-6">
          <OddsClient />
        </div>
      </div>
    </div>
  );
}
