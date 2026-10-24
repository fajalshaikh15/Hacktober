import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { inr } from "@/lib/mandi";
import { statusLabel, type BuyerRequestView, type Listing } from "@/lib/market";
import { confirmOrder, declineOrder, getMyRequests, listMarketplace, submitOrder } from "@/lib/market.functions";

export const Route = createFileRoute("/marketplace")({
  head: () => ({
    meta: [
      { title: "Bulk Buyer Marketplace — Bhav Setu" },
      { name: "description", content: "Browse farm stock across India, pick your quantity and request home delivery directly from the farmer." },
      { property: "og:title", content: "Bulk Buyer Marketplace — Bhav Setu" },
      { property: "og:description", content: "Browse farm stock across India, pick your quantity and request home delivery directly from the farmer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Marketplace,
});

type StoredRequest = { id: string; token: string };
const STORAGE_KEY = "bs_my_requests";

function loadStored(): StoredRequest[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as StoredRequest[];
  } catch {
    return [];
  }
}

function Marketplace() {
  const [tab, setTab] = useState<"browse" | "mine">("browse");
  const [stored, setStored] = useState<StoredRequest[]>([]);
  const [ordering, setOrdering] = useState<Listing | null>(null);

  useEffect(() => setStored(loadStored()), []);

  const { data } = useQuery({
    queryKey: ["marketplace"],
    queryFn: () => listMarketplace(),
    refetchInterval: 15000,
  });
  const listings = data?.listings ?? [];
  const notifications = data?.notifications ?? [];

  const { data: mine } = useQuery({
    queryKey: ["my-requests", stored],
    queryFn: () => getMyRequests({ data: { items: stored } }),
    enabled: stored.length > 0,
    refetchInterval: 15000,
  });

  const addStored = (item: StoredRequest) => {
    const next = [item, ...loadStored()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setStored(next);
  };

  return (
    <main className="min-h-screen font-sans">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link to="/" className="font-display text-2xl font-bold text-primary">Bhav Setu</Link>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm font-semibold text-muted-foreground hover:text-foreground">Mandi prices</Link>
            <Link to="/farmer" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Farmer sign in</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <p className="label uppercase tracking-widest">Bulk Buyer Marketplace</p>
        <h1 className="mt-2 font-display text-4xl font-bold md:text-5xl">Order produce to your doorstep</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Buyers and traders anywhere in India can browse available fruits and vegetables, pick a quantity and send a home
          delivery request. The farmer reviews every request, sets delivery charges, and you confirm the final total —
          nothing is booked automatically and delivery is not guaranteed until both sides agree.
        </p>

        {notifications.length > 0 && (
          <div className="card-soft mt-6 p-4">
            <p className="label">Stock alerts</p>
            <ul className="mt-2 space-y-1 text-sm">
              {notifications.slice(0, 5).map((n) => (
                <li key={n.id} className="text-muted-foreground">
                  📉 {n.crop} at {n.location} — now <b className="text-foreground">{n.remaining_quintals} quintals</b> left
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 flex gap-2">
          <button
            onClick={() => setTab("browse")}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${tab === "browse" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
          >
            Browse stock
          </button>
          <button
            onClick={() => setTab("mine")}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${tab === "mine" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
          >
            My requests ({stored.length})
          </button>
        </div>

        {tab === "browse" && (
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {!listings.length && <p className="text-muted-foreground">No stock listed yet — check back soon.</p>}
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} onOrder={() => setOrdering(l)} />
            ))}
          </div>
        )}

        {tab === "mine" && (
          <div className="mt-6 space-y-4">
            {!stored.length && <p className="text-muted-foreground">You haven't sent any delivery requests from this device yet.</p>}
            {(mine?.requests ?? []).map((r) => (
              <MyRequestCard key={r.id} req={r} token={stored.find((s) => s.id === r.id)?.token ?? ""} />
            ))}
          </div>
        )}
      </section>

      {ordering && (
        <OrderForm
          listing={ordering}
          onClose={() => setOrdering(null)}
          onSubmitted={(item) => {
            addStored(item);
            setOrdering(null);
            setTab("mine");
          }}
        />
      )}
    </main>
  );
}

function ListingCard({ listing: l, onOrder }: { listing: Listing; onOrder: () => void }) {
  const out = l.quantity_quintals <= 0;
  return (
    <div className="card-soft flex flex-col p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-2xl font-bold">{l.crop}</h3>
          {l.variety && <p className="text-sm text-muted-foreground">{l.variety}</p>}
        </div>
        {out ? (
          <span className="rounded bg-destructive px-2 py-1 text-xs font-bold text-destructive-foreground">Out of Stock</span>
        ) : (
          <span className="rounded bg-accent px-2 py-1 text-xs font-bold text-accent-foreground">Available</span>
        )}
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-muted-foreground">Price</dt><dd className="font-display text-lg font-bold text-primary">{inr(l.price_per_quintal)} / quintal</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Available</dt><dd className="font-semibold">{l.quantity_quintals} quintals</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Minimum order</dt><dd>{l.min_order_quintals} quintals</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Farm</dt><dd>{l.farm_name}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Location</dt><dd>{l.location}</dd></div>
      </dl>
      <button
        onClick={onOrder}
        disabled={out}
        className="mt-5 rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        {out ? "Out of stock" : "Request home delivery"}
      </button>
    </div>
  );
}

function OrderForm({ listing, onClose, onSubmitted }: { listing: Listing; onClose: () => void; onSubmitted: (item: StoredRequest) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [qty, setQty] = useState(listing.min_order_quintals);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const overStock = qty > listing.quantity_quintals;

  const submit = async () => {
    setError("");
    if (overStock) {
      setError(`Only ${listing.quantity_quintals} quintals available.`);
      return;
    }
    setBusy(true);
    try {
      const res = await submitOrder({
        data: { listingId: listing.id, buyerName: name, buyerPhone: phone, buyerAddress: address, quantity: qty },
      });
      onSubmitted({ id: res.id, token: res.token });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit your request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4" onClick={onClose}>
      <div className="card-soft max-h-[90vh] w-full max-w-lg overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-bold">Request home delivery</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {listing.crop} from {listing.farm_name}, {listing.location} — {inr(listing.price_per_quintal)}/quintal, {listing.quantity_quintals} quintals available.
        </p>
        <div className="mt-5 grid gap-4">
          <label className="block"><span className="label">Your name / business</span><input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
          <label className="block"><span className="label">Phone number</span><input className="field mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} /></label>
          <label className="block"><span className="label">Full delivery address</span><textarea className="field mt-1" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} placeholder="House/shop, street, town, district, state, PIN code" /></label>
          <label className="block">
            <span className="label">Quantity (quintals) — min {listing.min_order_quintals}, max {listing.quantity_quintals}</span>
            <input type="number" min={listing.min_order_quintals} max={listing.quantity_quintals} className="field mt-1" value={qty} onChange={(e) => setQty(parseFloat(e.target.value) || 0)} />
          </label>
          {overStock && <p className="text-sm font-semibold text-destructive">Only {listing.quantity_quintals} quintals available — please reduce your quantity.</p>}
          <p className="rounded-md bg-secondary p-3 text-sm">
            Produce cost: <b>{inr(listing.price_per_quintal * qty)}</b>. The farmer will add delivery charges before you confirm the final total.
          </p>
          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          <div className="flex gap-3">
            <button onClick={submit} disabled={busy || overStock} className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? "Sending…" : "Send delivery request"}
            </button>
            <button onClick={onClose} className="rounded-md border border-border px-5 py-3 font-semibold">Cancel</button>
          </div>
          <p className="text-xs text-muted-foreground">Sending a request does not book the order. The farmer can accept or reject it, and delivery is confirmed only after you approve the final total.</p>
        </div>
      </div>
    </div>
  );
}

function MyRequestCard({ req, token }: { req: BuyerRequestView; token: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const act = async (fn: typeof confirmOrder | typeof declineOrder) => {
    setBusy(true);
    setError("");
    try {
      await fn({ data: { id: req.id, token } });
      await qc.invalidateQueries({ queryKey: ["my-requests"] });
      await qc.invalidateQueries({ queryKey: ["marketplace"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-soft p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-bold">{req.crop} — {req.quantity_quintals} quintals</h3>
          <p className="text-sm text-muted-foreground">{req.farm_name}, {req.location} · requested {new Date(req.created_at).toLocaleDateString("en-IN")}</p>
        </div>
        <span className="rounded bg-secondary px-2 py-1 text-xs font-bold">{statusLabel(req.status)}</span>
      </div>
      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-muted-foreground">Produce cost</dt><dd>{inr(req.produce_cost)}</dd></div>
        {req.delivery_charges != null && <div className="flex justify-between"><dt className="text-muted-foreground">Delivery charges</dt><dd>{inr(req.delivery_charges)}</dd></div>}
        {req.total_price != null && <div className="flex justify-between font-semibold"><dt>Total price</dt><dd className="font-display text-lg text-primary">{inr(req.total_price)}</dd></div>}
      </dl>
      {req.status === "accepted" && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">The farmer accepted and set delivery charges. Confirm to book the order and reserve your stock, or decline.</p>
          <div className="mt-3 flex gap-3">
            <button onClick={() => act(confirmOrder)} disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Confirm order — {req.total_price != null ? inr(req.total_price) : ""}</button>
            <button onClick={() => act(declineOrder)} disabled={busy} className="rounded-md border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50">Decline</button>
          </div>
        </div>
      )}
      {req.status === "pending" && <p className="mt-4 text-sm text-muted-foreground">Waiting for the farmer to review your request.</p>}
      {error && <p className="mt-3 text-sm font-semibold text-destructive">{error}</p>}
    </div>
  );
}
