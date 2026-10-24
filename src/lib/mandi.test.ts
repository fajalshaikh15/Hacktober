import { describe, it, expect } from "vitest";
import { calcProfit } from "./mandi";

describe("calcProfit", () => {
  it("includes return-journey fuel and quantity loss", () => {
    const r = calcProfit({
      price: 2000, distance: 100, quantity: 10, mileage: 5, diesel: 90,
      otherTransport: 500, handling: 300, produceCost: 1000, lossPct: 10,
    });
    expect(r.fuel).toBe(3600); // 200 km / 5 * 90
    expect(r.revenue).toBe(18000); // 9 q * 2000
    expect(r.net).toBe(18000 - (3600 + 500 + 300 + 10000));
  });
});
