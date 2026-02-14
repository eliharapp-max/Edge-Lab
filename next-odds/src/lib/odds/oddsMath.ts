export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || american === 0) {
    throw new Error(`Invalid American odds: ${american}`);
  }
  const dec = american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
  return Math.round(dec * 10000) / 10000;
}

export function decimalToAmerican(decimal: number): number {
  if (!Number.isFinite(decimal) || decimal <= 1) {
    throw new Error(`Invalid Decimal odds: ${decimal}`);
  }
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  }
  return -Math.round(100 / (decimal - 1));
}

export function formatAmerican(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}

export function safeParseAmerican(input: string): number | null {
  const cleaned = input.trim().replace(/^\+/, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.trunc(n);
}
