import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { inr } from "@/lib/mandi";
import { calcFarmerMargin, statusLabel, type DeliveryRequest, type Listing } from "@/lib/market";
import { acceptRequest, farmerDashboard, rejectRequest, saveListing } from "@/lib/market.functions";

export const Route = createFileRoute("/farmer")({
  head: () => ({
    meta: [
      { title: "Farmer Dashboard — Bhav Setu" },
      { name: "description", content: "List your stock, set prices and accept or reject home delivery requests from bulk buyers." },
      { property: "og:title", content: "Farmer Dashboard — Bhav Setu" },
      { property: "og:description", content: "List your stock, set prices and accept or reject home delivery requests from bulk buyers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FarmerPage,
});

function FarmerPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUserId(session?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <main className="min-h-screen font-sans">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link to="/" className="font-display text-2xl font-bold text-primary">Bhav Setu</Link>
          <div className="flex items-center gap-3">
            <Link to="/marketplace" className="text-sm font-semibold text-muted-foreground hover:text-foreground">Marketplace</Link>
            {userId && (
              <button onClick={() => supabase.auth.signOut()} className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Sign out</button>
            )}
          </div>
        </div>
      </header>
      {!ready ? null : userId ? <Dashboard /> : <SignIn />}
    </main>
  );
}

function SignIn() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    setMsg("");
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Account created. If email confirmation is on, check your inbox before signing in.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-4xl font-bold">Farmer sign in</h1>
      <p className="mt-2 text-muted-foreground">Sign in to list your stock and answer delivery requests.</p>
      <div className="card-soft mt-6 grid gap-4 p-6">
        <label className="block"><span className="label">Email</span><input type="email" className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="block"><span className="label">Password</span><input type="password" className="field mt-1" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {msg && <p className="text-sm font-semibold text-primary">{msg}</p>}
        <button onClick={go} disabled={busy} className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="text-sm font-semibold text-muted-foreground">
          {mode === "in" ? "New farmer? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </section>
  );
}

const EMPTY_FORM = { crop: "", variety: "", farmName: "", location: "", pricePerQuintal: 0, quantityQuintals: 0, minOrderQuintals: 1 };

function Dashboard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["farmer-dashboard"],
    queryFn: () => farmerDashboard(),
    refetchInterval: 15000,
  });
  const listings = data?.listings ?? [];
  const requests = data?.requests ?? [];
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["farmer-dashboard"] });

  const save = async () => {
    setMsg("");
    try {
      await saveListing({ data: { id: editingId ?? undefined, ...form, variety: form.variety || undefined } });
      setForm(EMPTY_FORM);
      setEditingId(null);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save.");
    }
  };

  const edit = (l: Listing) => {
    setEditingId(l.id);
    setForm({
      crop: l.crop,
      variety: l.variety ?? "",
      farmName: l.farm_name,
      location: l.location,
      pricePerQuintal: l.price_per_quintal,
      quantityQuintals: l.quantity_quintals,
      minOrderQuintals: l.min_order_quintals,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pending = requests.filter((r) => r.status === "pending");
  const handled = requests.filter((r) => r.status !== "pending");

  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-display text-4xl font-bold">Your farm dashboard</h1>

      <div className="card-soft mt-8 p-6">
        <h2 className="font-display text-2xl font-bold">{editingId ? "Edit listing" : "List new stock"}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block"><span className="label">Crop</span><input className="field mt-1" value={form.crop} onChange={(e) => setForm({ ...form, crop: e.target.value })} placeholder="e.g. Onion" maxLength={60} /></label>
          <label className="block"><span className="label">Variety (optional)</span><input className="field mt-1" value={form.variety} onChange={(e) => setForm({ ...form, variety: e.target.value })} maxLength={60} /></label>
          <label className="block"><span className="label">Farm name</span><input className="field mt-1" value={form.farmName} onChange={(e) => setForm({ ...form, farmName: e.target.value })} maxLength={100} /></label>
          <label className="block"><span className="label">Location (village, district, state)</span><input className="field mt-1" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={120} /></label>
          <Num label="Price (₹/quintal)" value={form.pricePerQuintal} onChange={(n) => setForm({ ...form, pricePerQuintal: n })} />
          <Num label="Available quantity (quintals)" value={form.quantityQuintals} onChange={(n) => setForm({ ...form, quantityQuintals: n })} />
          <Num label="Minimum order (quintals)" value={form.minOrderQuintals} onChange={(n) => setForm({ ...form, minOrderQuintals: n })} />
        </div>
        <div className="mt-4 flex gap-3">
          <button onClick={save} className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground">{editingId ? "Save changes" : "Add listing"}</button>
          {editingId && <button onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }} className="rounded-md border border-border px-5 py-3 font-semibold">Cancel</button>}
        </div>
        {msg && <p className="mt-3 text-sm font-semibold text-destructive">{msg}</p>}
      </div>

      <h2 className="mt-10 font-display text-2xl font-bold">Your listings</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {!listings.length && <p className="text-muted-foreground">No listings yet — add your first stock above.</p>}
        {listings.map((l) => (
          <div key={l.id} className="card-soft p-5">
            <div className="flex items-start justify-between">
              <h3 className="font-display text-xl font-bold">{l.crop}{l.variety ? ` (${l.variety})` : ""}</h3>
              {l.quantity_quintals <= 0 && <span className="rounded bg-destructive px-2 py-1 text-xs font-bold text-destructive-foreground">Out of Stock</span>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{l.farm_name}, {l.location}</p>
            <p className="mt-2 text-sm"><b>{inr(l.price_per_quintal)}</b>/quintal · <b>{l.quantity_quintals} quintals</b> left · min {l.min_order_quintals}</p>
            <button onClick={() => edit(l)} className="mt-3 rounded-md border border-border px-4 py-2 text-sm font-semibold">Edit / update stock</button>
          </div>
        ))}
      </div>

      <h2 className="mt-10 font-display text-2xl font-bold">Delivery requests {pending.length > 0 && <span className="ml-2 rounded bg-accent px-2 py-1 text-sm font-bold text-accent-foreground">{pending.length} new</span>}</h2>
      <div className="mt-4 space-y-4">
        {!requests.length && <p className="text-muted-foreground">No delivery requests yet.</p>}
        {pending.map((r) => <RequestCard key={r.id} req={r} listings={listings} onDone={refresh} />)}
        {handled.map((r) => (
          <div key={r.id} className="card-soft p-5 opacity-80">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{r.buyer_name} — {r.quantity_quintals} quintals</p>
              <span className="rounded bg-secondary px-2 py-1 text-xs font-bold">{statusLabel(r.status)}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {r.buyer_address} · {r.buyer_phone}
              {r.total_price != null && <> · Total {inr(r.total_price)} (produce {inr(r.produce_cost)} + delivery {inr(r.delivery_charges ?? 0)})</>}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input type="number" min={0} className="field mt-1" value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </label>
  );
}

function RequestCard({ req, listings, onDone }: { req: DeliveryRequest; listings: Listing[]; onDone: () => Promise<unknown> }) {
  const listing = listings.find((l) => l.id === req.listing_id);
  const [charges, setCharges] = useState(0);
  const [costPerQ, setCostPerQ] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const price = listing ? listing.price_per_quintal : req.produce_cost / req.quantity_quintals;
  const margin = calcFarmerMargin(price, costPerQ, req.quantity_quintals, charges);
  const total = req.produce_cost + charges;

  const act = async (kind: "accept" | "reject") => {
    setBusy(true);
    setError("");
    try {
      if (kind === "accept") await acceptRequest({ data: { requestId: req.id, deliveryCharges: charges } });
      else await rejectRequest({ data: { requestId: req.id } });
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-soft p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-xl font-bold">{req.buyer_name} wants {req.quantity_quintals} quintals</h3>
          <p className="text-sm text-muted-foreground">{listing ? `${listing.crop} — ${listing.quantity_quintals} quintals in stock` : "Listing removed"}</p>
        </div>
        <span className="rounded bg-secondary px-2 py-1 text-xs font-bold">{new Date(req.created_at).toLocaleDateString("en-IN")}</span>
      </div>
      <div className="mt-3 rounded-md bg-secondary p-3 text-sm">
        <p><b>Deliver to:</b> {req.buyer_address}</p>
        <p className="mt-1"><b>Phone:</b> {req.buyer_phone}</p>
      </div>
      <p className="mt-3 text-sm">Produce value: <b>{inr(req.produce_cost)}</b> ({req.quantity_quintals} q × {inr(price)})</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Num label="Your delivery charges (₹ total)" value={charges} onChange={setCharges} />
        <Num label="Your produce cost (₹/quintal)" value={costPerQ} onChange={setCostPerQ} />
      </div>
      <div className="mt-4 rounded-md border border-border p-3 text-sm">
        <p>Buyer will pay: <b className="font-display text-lg text-primary">{inr(total)}</b> (produce {inr(req.produce_cost)} + delivery {inr(charges)})</p>
        <p className={`mt-1 font-semibold ${margin < 0 ? "text-destructive" : "text-primary"}`}>
          Your estimated margin: {inr(margin)} {margin < 0 ? "— this order loses money, raise delivery charges or reject it." : "— profitable at these numbers."}
        </p>
      </div>
      {error && <p className="mt-3 text-sm font-semibold text-destructive">{error}</p>}
      <div className="mt-4 flex gap-3">
        <button onClick={() => act("accept")} disabled={busy} className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">Accept & send total to buyer</button>
        <button onClick={() => act("reject")} disabled={busy} className="rounded-md border border-border px-5 py-3 font-semibold disabled:opacity-50">Reject</button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Accepting does not confirm the order — the buyer confirms the final total first. Stock is reserved only after the buyer confirms.</p>
    </div>
  );
}
