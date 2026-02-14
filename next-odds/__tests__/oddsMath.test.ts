import { americanToDecimal, decimalToAmerican } from "../src/lib/odds/oddsMath.js";

describe("odds conversion", () => {
  test("american to decimal (+150)", () => {
    expect(americanToDecimal(150)).toBeCloseTo(2.5, 5);
  });

  test("american to decimal (-150)", () => {
    expect(americanToDecimal(-150)).toBeCloseTo(1.6666, 3);
  });

  test("decimal to american (2.5)", () => {
    expect(decimalToAmerican(2.5)).toBe(150);
  });

  test("decimal to american (~1.6667)", () => {
    expect(decimalToAmerican(1.6667)).toBe(-150);
  });
});
