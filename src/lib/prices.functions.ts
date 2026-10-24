import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SAMPLE, type PriceResult, type PriceRow } from "./mandi";

const RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070"; // AGMARKNET daily prices on data.gov.in

export const getPrices = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ crop: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }): Promise<PriceResult> => {
    const key = process.env["Mandi_Price_Key"];
    const fallback = (note: string): PriceResult => ({
      rows: SAMPLE[data.crop] ?? [],
      live: false,
      note,
    });
    if (!key) return fallback("Live price key not added yet — showing sample prices.");
    try {
      const url = new URL(`https://api.data.gov.in/resource/${RESOURCE}`);
      url.searchParams.set("api-key", key);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "500");
      url.searchParams.set("filters[commodity]", data.crop);
      const res = await fetch(url);
      if (!res.ok) return fallback(`Live prices unavailable (${res.status}) — showing sample prices.`);
      const json = (await res.json()) as { records?: Record<string, string>[] };
      const rows: PriceRow[] = (json.records ?? [])
        .map((r) => ({
          market: r.market,
          state: r.state,
          district: r.district,
          variety: r.variety,
          modal: Number(r.modal_price),
          min: Number(r.min_price),
          max: Number(r.max_price),
          date: r.arrival_date,
        }))
        .filter((r) => r.market && r.modal > 0);
      if (!rows.length) return fallback("No live records today for this crop — showing sample prices.");
      return { rows, live: true, note: "" };
    } catch {
      return fallback("Could not reach the price service — showing sample prices.");
    }
  });
