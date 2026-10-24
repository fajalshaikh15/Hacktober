import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { calcOrderTotal, type BuyerRequestView, type DeliveryRequest, type Listing, type RequestStatus, type StockNotification } from "./market";

function publicClient() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ---------- Public: browse stock + alerts ----------

export const listMarketplace = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ listings: Listing[]; notifications: StockNotification[] }> => {
    const sb = publicClient();
    const [{ data: listings }, { data: notifications }] = await Promise.all([
      sb
        .from("market_listings")
        .select("id, farmer_id, crop, variety, farm_name, location, price_per_quintal, quantity_quintals, min_order_quintals, created_at")
        .order("created_at", { ascending: false }),
      sb.from("stock_notifications").select("id, listing_id, crop, location, remaining_quintals, created_at").order("created_at", { ascending: false }).limit(10),
    ]);
    return { listings: (listings ?? []) as Listing[], notifications: (notifications ?? []) as StockNotification[] };
  },
);

// ---------- Public: buyer places / tracks a home delivery request ----------

const orderSchema = z.object({
  listingId: z.string().uuid(),
  buyerName: z.string().trim().min(1).max(100),
  buyerPhone: z.string().trim().min(5).max(20),
  buyerAddress: z.string().trim().min(10).max(500),
  quantity: z.number().positive().max(100000),
});

export const submitOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => orderSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string; token: string }> => {
    const sb = await adminClient();
    const { data: listing } = await sb
      .from("market_listings")
      .select("id, price_per_quintal, quantity_quintals, min_order_quintals")
      .eq("id", data.listingId)
      .single();
    if (!listing) throw new Error("This listing is no longer available.");
    if (listing.quantity_quintals <= 0) throw new Error("This crop is out of stock right now.");
    if (data.quantity < listing.min_order_quintals)
      throw new Error(`Minimum order for this listing is ${listing.min_order_quintals} quintals.`);
    if (data.quantity > listing.quantity_quintals)
      throw new Error(`Only ${listing.quantity_quintals} quintals available — please reduce your quantity.`);
    const produceCost = listing.price_per_quintal * data.quantity;
    const { data: inserted, error } = await sb
      .from("delivery_requests")
      .insert({
        listing_id: data.listingId,
        buyer_name: data.buyerName,
        buyer_phone: data.buyerPhone,
        buyer_address: data.buyerAddress,
        quantity_quintals: data.quantity,
        produce_cost: produceCost,
        status: "pending",
      })
      .select("id, buyer_token")
      .single();
    if (error || !inserted) throw new Error("Could not submit your request. Please try again.");
    return { id: inserted.id, token: inserted.buyer_token };
  });

const trackSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), token: z.string().uuid() })).max(50),
});

export const getMyRequests = createServerFn({ method: "POST" })
  .inputValidator((d) => trackSchema.parse(d))
  .handler(async ({ data }): Promise<{ requests: BuyerRequestView[] }> => {
    if (!data.items.length) return { requests: [] };
    const sb = await adminClient();
    const ids = data.items.map((i) => i.id);
    const { data: rows } = await sb
      .from("delivery_requests")
      .select("id, buyer_token, listing_id, quantity_quintals, produce_cost, delivery_charges, total_price, status, created_at, market_listings(crop, location, farm_name)")
      .in("id", ids);
    const tokenById = new Map(data.items.map((i) => [i.id, i.token]));
    const requests: BuyerRequestView[] = (rows ?? [])
      .filter((r) => tokenById.get(r.id) === r.buyer_token)
      .map((r) => ({
        id: r.id,
        listing_id: r.listing_id,
        quantity_quintals: r.quantity_quintals,
        produce_cost: r.produce_cost,
        delivery_charges: r.delivery_charges,
        total_price: r.total_price,
        status: r.status as RequestStatus,
        created_at: r.created_at,
        crop: (r.market_listings as { crop: string; location: string; farm_name: string } | null)?.crop ?? "Crop",
        location: (r.market_listings as { crop: string; location: string; farm_name: string } | null)?.location ?? "",
        farm_name: (r.market_listings as { crop: string; location: string; farm_name: string } | null)?.farm_name ?? "",
      }));
    return { requests };
  });

const buyerActionSchema = z.object({ id: z.string().uuid(), token: z.string().uuid() });

export const confirmOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => buyerActionSchema.parse(d))
  .handler(async ({ data }): Promise<{ remaining: number }> => {
    const sb = await adminClient();
    const { data: req } = await sb
      .from("delivery_requests")
      .select("id, buyer_token, listing_id, quantity_quintals, status")
      .eq("id", data.id)
      .single();
    if (!req || req.buyer_token !== data.token) throw new Error("Request not found.");
    if (req.status !== "accepted") throw new Error("This request is not waiting for your confirmation.");
    const { data: remaining, error } = await sb.rpc("decrement_stock", { p_listing_id: req.listing_id, p_qty: req.quantity_quintals });
    if (error) throw new Error(error.message.includes("available") ? error.message : "Not enough stock left to confirm this order.");
    await sb.from("delivery_requests").update({ status: "confirmed", updated_at: new Date().toISOString() }).eq("id", data.id);
    return { remaining: Number(remaining) };
  });

export const declineOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => buyerActionSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const sb = await adminClient();
    const { data: req } = await sb.from("delivery_requests").select("id, buyer_token, status").eq("id", data.id).single();
    if (!req || req.buyer_token !== data.token) throw new Error("Request not found.");
    if (req.status !== "accepted") throw new Error("This request can no longer be declined.");
    await sb.from("delivery_requests").update({ status: "declined", updated_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });

// ---------- Farmer: listings + accept/reject ----------

export const farmerDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ listings: Listing[]; requests: DeliveryRequest[] }> => {
    const { supabase, userId } = context;
    const [{ data: listings }, { data: requests }] = await Promise.all([
      supabase
        .from("market_listings")
        .select("id, farmer_id, crop, variety, farm_name, location, price_per_quintal, quantity_quintals, min_order_quintals, created_at")
        .eq("farmer_id", userId)
        .order("created_at", { ascending: false }),
      supabase.from("delivery_requests").select("*").order("created_at", { ascending: false }),
    ]);
    return { listings: (listings ?? []) as Listing[], requests: (requests ?? []) as DeliveryRequest[] };
  });

const listingSchema = z.object({
  id: z.string().uuid().optional(),
  crop: z.string().trim().min(1).max(60),
  variety: z.string().trim().max(60).optional(),
  farmName: z.string().trim().min(1).max(100),
  location: z.string().trim().min(1).max(120),
  pricePerQuintal: z.number().positive().max(10000000),
  quantityQuintals: z.number().min(0).max(1000000),
  minOrderQuintals: z.number().positive().max(1000000),
});

export const saveListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listingSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const row = {
      farmer_id: userId,
      crop: data.crop,
      variety: data.variety || null,
      farm_name: data.farmName,
      location: data.location,
      price_per_quintal: data.pricePerQuintal,
      quantity_quintals: data.quantityQuintals,
      min_order_quintals: data.minOrderQuintals,
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await supabase.from("market_listings").update(row).eq("id", data.id).eq("farmer_id", userId)
      : await supabase.from("market_listings").insert(row);
    if (error) throw new Error("Could not save the listing. Please try again.");
    return { ok: true };
  });

const acceptSchema = z.object({
  requestId: z.string().uuid(),
  deliveryCharges: z.number().min(0).max(10000000),
});

export const acceptRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => acceptSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ total: number }> => {
    const { supabase } = context;
    const { data: req } = await supabase
      .from("delivery_requests")
      .select("id, produce_cost, status")
      .eq("id", data.requestId)
      .single();
    if (!req) throw new Error("Request not found.");
    if (req.status !== "pending") throw new Error("This request has already been handled.");
    const total = calcOrderTotal(req.produce_cost, data.deliveryCharges);
    const { error } = await supabase
      .from("delivery_requests")
      .update({ status: "accepted", delivery_charges: data.deliveryCharges, total_price: total, updated_at: new Date().toISOString() })
      .eq("id", data.requestId);
    if (error) throw new Error("Could not accept the request. Please try again.");
    return { total };
  });

export const rejectRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const { data: req } = await supabase.from("delivery_requests").select("id, status").eq("id", data.requestId).single();
    if (!req) throw new Error("Request not found.");
    if (req.status !== "pending") throw new Error("This request has already been handled.");
    const { error } = await supabase
      .from("delivery_requests")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", data.requestId);
    if (error) throw new Error("Could not reject the request. Please try again.");
    return { ok: true };
  });
