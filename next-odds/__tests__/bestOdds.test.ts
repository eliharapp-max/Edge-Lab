import { pickBestOdds } from "../src/lib/odds/bestOdds.js";

describe("best odds selection", () => {
  test("picks higher payout by decimal equivalence", () => {
    const best = pickBestOdds([
      { bookKey: "a", oddsAmerican: -110, lastUpdated: new Date().toISOString() },
      { bookKey: "b", oddsAmerican: -105, lastUpdated: new Date().toISOString() },
      { bookKey: "c", oddsAmerican: +100, lastUpdated: new Date().toISOString() },
    ]);
    expect(best?.bookKey).toBe("c");
  });

  test("among negatives, closer to zero wins (higher decimal)", () => {
    const best = pickBestOdds([
      { bookKey: "a", oddsAmerican: -120, lastUpdated: new Date().toISOString() },
      { bookKey: "b", oddsAmerican: -105, lastUpdated: new Date().toISOString() },
      { bookKey: "c", oddsAmerican: -110, lastUpdated: new Date().toISOString() },
    ]);
    expect(best?.bookKey).toBe("b");
  });
});
