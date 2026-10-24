export type PriceRow = {
  market: string;
  state: string;
  district?: string | undefined;
  variety?: string | undefined;
  modal: number;
  min?: number | undefined;
  max?: number | undefined;
  date?: string | undefined;
};

export type PriceResult = {
  rows: PriceRow[];
  live: boolean;
  note: string;
};

export const CROPS = [
  { id: "Onion", emoji: "🧅" },
  { id: "Tomato", emoji: "🍅" },
  { id: "Wheat", emoji: "🌾" },
  { id: "Apple", emoji: "🍎" },
] as const;

export const SAMPLE: Record<string, PriceRow[]> = {
  Onion: [
    { market: "Azadpur", state: "Delhi", modal: 2600 },
    { market: "Pune", state: "Maharashtra", modal: 2100 },
    { market: "Lasalgaon", state: "Maharashtra", modal: 1800 },
  ],
  Tomato: [
    { market: "Azadpur", state: "Delhi", modal: 1900 },
    { market: "Kolar", state: "Karnataka", modal: 1500 },
    { market: "Pune", state: "Maharashtra", modal: 1700 },
  ],
  Wheat: [
    { market: "Khanna", state: "Punjab", modal: 2450 },
    { market: "Indore", state: "Madhya Pradesh", modal: 2380 },
    { market: "Karnal", state: "Haryana", modal: 2420 },
  ],
  Apple: [
    { market: "Azadpur", state: "Delhi", modal: 7800 },
    { market: "Shimla", state: "Himachal Pradesh", modal: 7200 },
    { market: "Sopore", state: "Jammu and Kashmir", modal: 6500 },
  ],
};

export type CostInputs = {
  price: number; // ₹/quintal
  distance: number; // one-way km
  quantity: number; // quintals
  mileage: number; // km/l
  diesel: number; // ₹/l
  otherTransport: number; // ₹ total
  handling: number; // ₹ total
  produceCost: number; // ₹/quintal
  lossPct: number; // %
};

export function calcProfit(i: CostInputs) {
  const soldQty = i.quantity * (1 - i.lossPct / 100);
  const revenue = soldQty * i.price;
  const fuel = i.mileage > 0 ? ((2 * i.distance) / i.mileage) * i.diesel : 0;
  const produce = i.quantity * i.produceCost;
  const costs = fuel + i.otherTransport + i.handling + produce;
  return { soldQty, revenue, fuel, produce, costs, net: revenue - costs };
}

export const inr = (n: number) =>
  "₹" + Math.round(n).toLocaleString("en-IN");
