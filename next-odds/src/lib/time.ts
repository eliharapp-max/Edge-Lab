export function minutesBetween(a: Date, b: Date) {
  const diffMs = Math.abs(a.getTime() - b.getTime());
  return diffMs / 1000 / 60;
}

export function nowUtc() {
  return new Date();
}
