import { americanToDecimal } from "./oddsMath.js";

export type Candidate = {
  bookKey: string;
  oddsAmerican: number;
  lastUpdated: string;
};

export function pickBestOdds(candidates: Candidate[]) {
  if (!candidates.length) return null;

  let best = candidates[0];
  let bestDec = americanToDecimal(best.oddsAmerican);

  for (let i = 1; i < candidates.length; i++) {
    const cand = candidates[i];
    const candDec = americanToDecimal(cand.oddsAmerican);
    if (candDec > bestDec) {
      best = cand;
      bestDec = candDec;
    }
  }

  return { ...best, oddsDecimal: bestDec };
}
