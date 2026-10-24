import { describe, expect, it } from "vitest";
import { calcFarmerMargin, calcOrderTotal } from "./market";

describe("marketplace money math", () => {
  it("buyer total is produce cost plus delivery charges", () => {
    // 10 quintals at ₹2,000 = ₹20,000 produce + ₹3,500 delivery
    expect(calcOrderTotal(20000, 3500)).toBe(23500);
  });

  it("farmer margin subtracts own produce cost and delivery charges", () => {
    // sells 10 q at ₹2,000, crop cost ₹1,500/q, delivery ₹3,500 → (2000-1500)*10 - 3500 = 1500
    expect(calcFarmerMargin(2000, 1500, 10, 3500)).toBe(1500);
  });

  it("margin goes negative when delivery charges exceed the spread", () => {
    expect(calcFarmerMargin(2000, 1900, 10, 5000)).toBeLessThan(0);
  });
});
