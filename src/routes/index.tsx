import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import hero from "@/assets/mandi-hero.jpg";
import { CROPS, calcProfit, inr, type CostInputs, type PriceRow } from "@/lib/mandi";
import { getPrices } from "@/lib/prices.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bhav Setu — Mandi prices & profit planner" },
      { name: "description", content: "Live mandi prices, a trip profit calculator and a best-market finder for farmers." },
      { property: "og:title", content: "Bhav Setu — Mandi prices & profit planner" },
      { property: "og:description", content: "Live mandi prices, a trip profit calculator and a best-market finder for farmers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const DEFAULT_COSTS: Omit<CostInputs, "price" | "distance"> = {
  quantity: 20, mileage: 6, diesel: 92, otherTransport: 1000, handling: 800, produceCost: 900, lossPct: 3,
};

function Index() {
  const [crop, setCrop] = useState<string>("Onion");
  const { data, isLoading } = useQuery({
    queryKey: ["prices", crop],
    queryFn: () => getPrices({ data: { crop } }),
  });
  const rows = data?.rows ?? [];

  return (
    <main className="font-sans">
      <Hero rows={rows} crop={crop} setCrop={setCrop} live={!!data?.live} />
      <PriceTable rows={rows} crop={crop} setCrop={setCrop} loading={isLoading} live={!!data?.live} note={data?.note} />
      <ProfitCalc rows={rows} />
      <Destinations rows={rows} crop={crop} />
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        Bhav Setu · Estimates only — always confirm rates and charges at the mandi.
      </footer>
    </main>
  );
}

function CropTabs({ crop, setCrop }: { crop: string; setCrop: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CROPS.map((c) => (
        <button
          key={c.id}
          onClick={() => setCrop(c.id)}
          className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
            crop === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"
          }`}
        >
          {c.emoji} {c.id}
        </button>
      ))}
    </div>
  );
}

function Hero({ rows, crop, setCrop, live }: { rows: PriceRow[]; crop: string; setCrop: (c: string) => void; live: boolean }) {
  const best = rows.length ? Math.max(...rows.map((r) => r.modal)) : 0;
  const avg = rows.length ? rows.reduce((a, r) => a + r.modal, 0) / rows.length : 0;
  const states = new Set(rows.map((r) => r.state)).size;
  return (
    <section className="relative min-h-[88vh] overflow-hidden">
      <img src={hero} alt="Sacks of onions and crates of tomatoes at a busy mandi at sunrise" width={1600} height={1008} className="absolute inset-0 h-full w-full object-cover" />
      <div className="hero-overlay absolute inset-0" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-28 text-primary-foreground lg:grid-cols-[1.3fr_1fr] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Sell smarter</p>
          <h1 className="mt-4 font-display text-6xl font-bold leading-[0.95] md:text-8xl">Bhav Setu</h1>
          <p className="mt-5 max-w-lg text-lg opacity-90">
            See today's mandi rates, subtract the cost of getting there, and pick the market that actually pays you most.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#prices" className="rounded-md bg-accent px-5 py-3 font-semibold text-accent-foreground">See prices</a>
            <a href="#profit" className="rounded-md border border-primary-foreground/50 px-5 py-3 font-semibold">Work out profit</a>
          </div>
        </div>
        <div className="card-soft p-6 text-card-foreground">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Today at a glance</h2>
            <span className="text-xs font-semibold text-muted-foreground">{live ? "● Live" : "Sample"}</span>
          </div>
          <div className="mt-4"><CropTabs crop={crop} setCrop={setCrop} /></div>
          <dl className="mt-6 grid grid-cols-3 gap-4">
            <Stat label="Top price" value={best ? inr(best) : "—"} sub="per quintal" />
            <Stat label="Average" value={avg ? inr(avg) : "—"} sub="per quintal" />
            <Stat label="Mandis" value={String(rows.length)} sub={`${states} states`} />
          </dl>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold text-primary">{value}</dd>
      <dd className="text-xs text-muted-foreground">{sub}</dd>
    </div>
  );
}

function PriceTable({ rows, crop, setCrop, loading, live, note }: { rows: PriceRow[]; crop: string; setCrop: (c: string) => void; loading: boolean; live: boolean; note?: string }) {
  const [state, setState] = useState("all");
  const [market, setMarket] = useState("all");
  const [sort, setSort] = useState("high");
  const states = useMemo(() => [...new Set(rows.map((r) => r.state))].sort(), [rows]);
  const markets = useMemo(() => [...new Set(rows.filter((r) => state === "all" || r.state === state).map((r) => r.market))].sort(), [rows, state]);
  const shown = useMemo(() => {
    const f = rows.filter((r) => (state === "all" || r.state === state) && (market === "all" || r.market === market));
    return [...f].sort((a, b) => (sort === "high" ? b.modal - a.modal : sort === "low" ? a.modal - b.modal : a.market.localeCompare(b.market)));
  }, [rows, state, market, sort]);
  const top = shown.length ? Math.max(...shown.map((r) => r.modal)) : 0;

  return (
    <section id="prices" className="mx-auto max-w-6xl px-6 py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label uppercase tracking-widest">Market board</p>
          <h2 className="font-display text-4xl font-bold md:text-5xl">Mandi rates</h2>
        </div>
        <CropTabs crop={crop} setCrop={(c) => { setCrop(c); setState("all"); setMarket("all"); }} />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <select className="field" value={state} onChange={(e) => { setState(e.target.value); setMarket("all"); }}>
          <option value="all">All states</option>
          {states.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="field" value={market} onChange={(e) => setMarket(e.target.value)}>
          <option value="all">All mandis</option>
          {markets.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className="field" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="high">Price: high to low</option>
          <option value="low">Price: low to high</option>
          <option value="az">Mandi: A to Z</option>
        </select>
      </div>
      <div className="card-soft mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary text-muted-foreground">
            <tr><th className="p-4">Mandi</th><th className="p-4">State</th><th className="p-4">Modal price / quintal</th><th className="p-4">Range</th><th className="p-4">Date</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td className="p-4" colSpan={5}>Loading prices…</td></tr>}
            {!loading && !shown.length && <tr><td className="p-4" colSpan={5}>No mandis match these filters.</td></tr>}
            {shown.slice(0, 100).map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="p-4 font-semibold">
                  {r.market}
                  {r.modal === top && <span className="ml-2 rounded bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">TOP</span>}
                  {r.variety && <div className="text-xs font-normal text-muted-foreground">{r.variety}</div>}
                </td>
                <td className="p-4">{r.state}{r.district && <div className="text-xs text-muted-foreground">{r.district}</div>}</td>
                <td className="p-4 font-display text-lg font-bold text-primary">{inr(r.modal)}</td>
                <td className="p-4 text-muted-foreground">{r.min && r.max ? `${inr(r.min)} – ${inr(r.max)}` : "—"}</td>
                <td className="p-4 text-muted-foreground">{r.date ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {live ? "Source: AGMARKNET via data.gov.in. Confirm on the day before selling." : note}
      </p>
    </section>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input type="number" min={0} className="field mt-1" value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </label>
  );
}

function CostFields({ c, set }: { c: typeof DEFAULT_COSTS; set: (c: typeof DEFAULT_COSTS) => void }) {
  const f = (k: keyof typeof DEFAULT_COSTS) => (n: number) => set({ ...c, [k]: n });
  return (
    <>
      <NumField label="Quantity (quintals)" value={c.quantity} onChange={f("quantity")} />
      <NumField label="Vehicle mileage (km/litre)" value={c.mileage} onChange={f("mileage")} />
      <NumField label="Diesel (₹/litre)" value={c.diesel} onChange={f("diesel")} />
      <NumField label="Other transport (₹ total)" value={c.otherTransport} onChange={f("otherTransport")} />
      <NumField label="Handling & market fees (₹ total)" value={c.handling} onChange={f("handling")} />
      <NumField label="Produce cost (₹/quintal)" value={c.produceCost} onChange={f("produceCost")} />
      <NumField label="Expected loss (%)" value={c.lossPct} onChange={f("lossPct")} />
    </>
  );
}

function ProfitCalc({ rows }: { rows: PriceRow[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [price, setPrice] = useState(2000);
  const [distance, setDistance] = useState(120);
  const [c, setC] = useState(DEFAULT_COSTS);
  const [result, setResult] = useState<ReturnType<typeof calcProfit> | null>(null);

  return (
    <section id="profit" className="bg-primary py-20 text-primary-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="font-display text-4xl font-bold md:text-5xl">What will you take home?</h2>
          <div className="card-soft mt-8 grid gap-4 p-6 text-card-foreground sm:grid-cols-2">
            <label className="block"><span className="label">Your village / town</span><input className="field mt-1" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="e.g. Niphad" /></label>
            <label className="block">
              <span className="label">Target mandi</span>
              <select className="field mt-1" value={to} onChange={(e) => { setTo(e.target.value); const r = rows.find((x) => x.market + x.state === e.target.value); if (r) setPrice(r.modal); }}>
                <option value="">Choose a mandi</option>
                {rows.slice(0, 100).map((r, i) => <option key={i} value={r.market + r.state}>{r.market} — {r.state}</option>)}
              </select>
            </label>
            <NumField label="Selling price (₹/quintal)" value={price} onChange={setPrice} />
            <NumField label="One-way distance (km)" value={distance} onChange={setDistance} />
            <CostFields c={c} set={setC} />
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <button onClick={() => setResult(calcProfit({ ...c, price, distance }))} className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground">Calculate profit</button>
              <button onClick={() => { setC(DEFAULT_COSTS); setPrice(2000); setDistance(120); setResult(null); }} className="rounded-md border border-border px-5 py-3 font-semibold">Reset</button>
            </div>
          </div>
        </div>
        <div className="lg:pt-20">
          <div className="rounded-xl border border-primary-foreground/30 p-6">
            <p className="text-sm opacity-80">Sales after loss</p>
            <p className="font-display text-3xl font-bold">{result ? inr(result.revenue) : "₹ —"}</p>
            <p className="mt-6 text-sm opacity-80">Estimated net profit</p>
            <p className={`font-display text-5xl font-bold ${result && result.net < 0 ? "text-destructive" : "text-accent"}`}>{result ? inr(result.net) : "₹ —"}</p>
            {result && (
              <ul className="mt-6 space-y-1 text-sm opacity-90">
                <li>Fuel (both ways): {inr(result.fuel)}</li>
                <li>Produce cost: {inr(result.produce)}</li>
                <li>Total costs: {inr(result.costs)}</li>
              </ul>
            )}
            <p className="mt-6 text-xs opacity-70">Fuel for the empty return trip is included. Tolls, commission and weighing fees may add more.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Destinations({ rows, crop }: { rows: PriceRow[]; crop: string }) {
  const [c, setC] = useState(DEFAULT_COSTS);
  const [dest, setDest] = useState<{ key: string; distance: number }[]>([{ key: "", distance: 0 }, { key: "", distance: 0 }]);
  const [ranked, setRanked] = useState<{ name: string; net: number }[] | null>(null);
  const find = (k: string) => rows.find((r) => r.market + r.state === k);

  const compare = () => {
    const out = dest.flatMap((d) => {
      const r = find(d.key);
      if (!r || d.distance <= 0) return [];
      return [{ name: `${r.market}, ${r.state}`, net: calcProfit({ ...c, price: r.modal, distance: d.distance }).net }];
    });
    setRanked(out.sort((a, b) => b.net - a.net));
  };

  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="font-display text-4xl font-bold md:text-5xl">Which mandi pays best?</h2>
      <p className="mt-2 text-muted-foreground">Uses {crop} prices. Enter the one-way distance to each mandi.</p>
      <div className="card-soft mt-8 grid gap-4 p-6 sm:grid-cols-3 lg:grid-cols-4"><CostFields c={c} set={setC} /></div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {dest.map((d, i) => {
          const r = find(d.key);
          return (
            <div key={i} className="card-soft p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-bold">Option {i + 1}</h3>
                {dest.length > 2 && <button className="text-sm text-muted-foreground" onClick={() => setDest(dest.filter((_, j) => j !== i))}>Remove</button>}
              </div>
              <select className="field mt-3" value={d.key} onChange={(e) => setDest(dest.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}>
                <option value="">Choose a mandi</option>
                {rows.slice(0, 100).map((r, k) => <option key={k} value={r.market + r.state}>{r.market} — {r.state}</option>)}
              </select>
              <p className="mt-2 text-sm">Price: <b>{r ? inr(r.modal) : "—"}</b> / quintal {r?.date && <span className="text-muted-foreground">· {r.date}</span>}</p>
              <div className="mt-3"><NumField label="One-way distance (km)" value={d.distance} onChange={(n) => setDest(dest.map((x, j) => (j === i ? { ...x, distance: n } : x)))} /></div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={() => setDest([...dest, { key: "", distance: 0 }])} className="rounded-md border border-border px-5 py-3 font-semibold">Add another mandi</button>
        <button onClick={compare} className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground">Compare profit</button>
      </div>
      {ranked && (
        <div className="card-soft mt-6 p-6">
          {!ranked.length && <p className="text-muted-foreground">Pick a mandi and enter a distance for at least one option.</p>}
          <ol className="space-y-2">
            {ranked.map((r, i) => (
              <li key={i} className="flex justify-between border-b border-border pb-2 last:border-0">
                <span className="font-semibold">{i === 0 && "🏆 "}{r.name}</span>
                <span className={`font-display font-bold ${r.net < 0 ? "text-destructive" : "text-primary"}`}>{inr(r.net)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
