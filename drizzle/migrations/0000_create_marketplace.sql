create table public.market_listings (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null,
  crop text not null,
  variety text,
  farm_name text not null,
  location text not null,
  price_per_quintal numeric not null check (price_per_quintal > 0),
  quantity_quintals numeric not null default 0 check (quantity_quintals >= 0),
  min_order_quintals numeric not null default 1 check (min_order_quintals > 0),
  last_bucket integer not null default -1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.market_listings to anon;
grant select, insert, update, delete on public.market_listings to authenticated;
grant all on public.market_listings to service_role;

alter table public.market_listings enable row level security;

create policy "Anyone can view listings"
  on public.market_listings for select to anon, authenticated using (true);
create policy "Farmers add own listings"
  on public.market_listings for insert to authenticated with check (farmer_id = auth.uid());
create policy "Farmers update own listings"
  on public.market_listings for update to authenticated using (farmer_id = auth.uid()) with check (farmer_id = auth.uid());
create policy "Farmers delete own listings"
  on public.market_listings for delete to authenticated using (farmer_id = auth.uid());

create table public.delivery_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_token uuid not null default gen_random_uuid(),
  listing_id uuid not null references public.market_listings(id) on delete cascade,
  buyer_name text not null,
  buyer_phone text not null,
  buyer_address text not null,
  quantity_quintals numeric not null check (quantity_quintals > 0),
  produce_cost numeric not null,
  delivery_charges numeric,
  total_price numeric,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','confirmed','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant insert on public.delivery_requests to anon;
grant select, insert, update on public.delivery_requests to authenticated;
grant all on public.delivery_requests to service_role;

alter table public.delivery_requests enable row level security;

create policy "Farmers read requests for own listings"
  on public.delivery_requests for select to authenticated
  using (exists (select 1 from public.market_listings l where l.id = listing_id and l.farmer_id = auth.uid()));
create policy "Farmers update requests for own listings"
  on public.delivery_requests for update to authenticated
  using (exists (select 1 from public.market_listings l where l.id = listing_id and l.farmer_id = auth.uid()))
  with check (exists (select 1 from public.market_listings l where l.id = listing_id and l.farmer_id = auth.uid()));

create table public.stock_notifications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.market_listings(id) on delete cascade,
  crop text not null,
  location text not null,
  remaining_quintals numeric not null,
  bucket integer not null,
  created_at timestamptz not null default now()
);

grant select on public.stock_notifications to anon, authenticated;
grant all on public.stock_notifications to service_role;

alter table public.stock_notifications enable row level security;

create policy "Anyone can read stock notifications"
  on public.stock_notifications for select to anon, authenticated using (true);

create or replace function public.decrement_stock(p_listing_id uuid, p_qty numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric;
  v_bucket integer;
  v_last integer;
  v_crop text;
  v_location text;
begin
  select quantity_quintals, last_bucket, crop, location
    into v_qty, v_last, v_crop, v_location
    from public.market_listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found'; end if;
  if p_qty <= 0 then raise exception 'Quantity must be positive'; end if;
  if v_qty < p_qty then raise exception 'Only % quintals available', v_qty; end if;
  v_qty := v_qty - p_qty;
  v_bucket := floor(v_qty / 10)::integer;
  if v_last = -1 then v_last := floor((v_qty + p_qty) / 10)::integer; end if;
  if v_bucket < v_last then
    insert into public.stock_notifications (listing_id, crop, location, remaining_quintals, bucket)
    values (p_listing_id, v_crop, v_location, v_qty, v_bucket);
  end if;
  update public.market_listings
    set quantity_quintals = v_qty, last_bucket = v_bucket, updated_at = now()
    where id = p_listing_id;
  return v_qty;
end;
$$;

revoke execute on function public.decrement_stock(uuid, numeric) from anon, authenticated;
grant execute on function public.decrement_stock(uuid, numeric) to service_role;