-- Region-scoped access. A user with regions set sees and acts only on customers in those regions
-- (and their invoices, payments, cases, actions, promises and messages). NULL means every region.
-- Regions compare case- and whitespace-insensitively, like lib/domain/regions.ts.
--
-- The app connects with a server-side role and enforces this in the repository layer
-- (lib/data/repository.ts). The restrictive policies below give direct client access the same limits.

alter table public.users add column regions text[];
alter table public.users add constraint users_regions_not_empty check (regions is null or cardinality(regions) > 0);

create index customers_company_region_idx on public.customers(company_id, lower(trim(region)));

-- Security definer: reads the caller's own row without going through the users policy.
create or replace function public.current_user_regions() returns text[] language sql stable security definer set search_path = public as $$
  select u.regions from public.users u where u.id = nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function public.region_visible(region text) returns boolean language sql stable as $$
  select public.current_user_regions() is null
      or lower(trim(region)) in (select lower(trim(r)) from unnest(public.current_user_regions()) r)
$$;

create or replace function public.customer_visible(customer uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_regions() is null
      or exists (select 1 from public.customers c where c.id = customer and public.region_visible(c.region))
$$;

create policy region_customers on public.customers as restrictive for all using (public.region_visible(region)) with check (public.region_visible(region));
create policy region_invoices on public.invoices as restrictive for all using (public.customer_visible(customer_id)) with check (public.customer_visible(customer_id));
create policy region_payments on public.payments as restrictive for all using (public.customer_visible(customer_id)) with check (public.customer_visible(customer_id));
create policy region_cases on public.collection_cases as restrictive for all using (public.customer_visible(customer_id)) with check (public.customer_visible(customer_id));
create policy region_actions on public.collection_actions as restrictive for all using (public.customer_visible(customer_id)) with check (public.customer_visible(customer_id));
create policy region_promises on public.payment_promises as restrictive for all using (public.customer_visible(customer_id)) with check (public.customer_visible(customer_id));
create policy region_messages on public.communication_messages as restrictive for all using (public.customer_visible(customer_id)) with check (public.customer_visible(customer_id));
-- Raw audit rows are not mapped to regions; regional users read them through the app, which filters them.
create policy region_audit on public.audit_events as restrictive for select using (public.current_user_regions() is null);
