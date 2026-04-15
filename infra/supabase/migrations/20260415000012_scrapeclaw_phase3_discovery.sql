-- ==========================================================================
-- Migration: 20260415000012_scrapeclaw_phase3_discovery.sql
-- ScrapeClaw phase 3 — Google Places discovery persistence
-- ==========================================================================

alter table public.scrapeclaw_businesses
  add column if not exists status text,
  add column if not exists formatted_address text,
  add column if not exists discovery_provider text,
  add column if not exists discovery_external_id text,
  add column if not exists discovery_query text,
  add column if not exists discovered_at timestamptz;

update public.scrapeclaw_businesses
set
  status = coalesce(status, 'discovered'),
  discovered_at = coalesce(discovered_at, created_at)
where status is null or discovered_at is null;

alter table public.scrapeclaw_businesses
  alter column status set default 'discovered',
  alter column status set not null,
  alter column discovered_at set default now(),
  alter column discovered_at set not null;

alter table public.scrapeclaw_businesses
  drop constraint if exists scrapeclaw_businesses_status_check,
  add constraint scrapeclaw_businesses_status_check
    check (status in ('discovered', 'researched', 'archived')),
  drop constraint if exists scrapeclaw_businesses_formatted_address_check,
  add constraint scrapeclaw_businesses_formatted_address_check
    check (formatted_address is null or char_length(formatted_address) <= 500),
  drop constraint if exists scrapeclaw_businesses_discovery_provider_check,
  add constraint scrapeclaw_businesses_discovery_provider_check
    check (discovery_provider is null or discovery_provider in ('google_places')),
  drop constraint if exists scrapeclaw_businesses_discovery_external_id_check,
  add constraint scrapeclaw_businesses_discovery_external_id_check
    check (discovery_external_id is null or char_length(discovery_external_id) <= 200),
  drop constraint if exists scrapeclaw_businesses_discovery_query_check,
  add constraint scrapeclaw_businesses_discovery_query_check
    check (discovery_query is null or char_length(discovery_query) <= 300);

create unique index if not exists scrapeclaw_businesses_user_website_unique_idx
  on public.scrapeclaw_businesses (user_id, canonical_website_url)
  where canonical_website_url is not null;

create unique index if not exists scrapeclaw_businesses_user_discovery_external_unique_idx
  on public.scrapeclaw_businesses (user_id, discovery_provider, discovery_external_id)
  where discovery_provider is not null and discovery_external_id is not null;

create index if not exists scrapeclaw_businesses_user_status_idx
  on public.scrapeclaw_businesses (user_id, status);

create table if not exists public.scrapeclaw_discovery_discards (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    provider text not null check (provider in ('google_places')),
    external_id text not null check (char_length(external_id) <= 200),
    reason text not null check (reason in ('no_website', 'duplicate_place', 'duplicate_website')),
    linked_business_id uuid references public.scrapeclaw_businesses(id) on delete set null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, provider, external_id)
);

create index if not exists scrapeclaw_discovery_discards_user_reason_idx
  on public.scrapeclaw_discovery_discards (user_id, reason);

alter table public.scrapeclaw_discovery_discards enable row level security;
drop policy if exists "Users can view their own ScrapeClaw discovery discards" on public.scrapeclaw_discovery_discards;
create policy "Users can view their own ScrapeClaw discovery discards"
  on public.scrapeclaw_discovery_discards for select using (auth.uid() = user_id);
drop policy if exists "Users can insert their own ScrapeClaw discovery discards" on public.scrapeclaw_discovery_discards;
create policy "Users can insert their own ScrapeClaw discovery discards"
  on public.scrapeclaw_discovery_discards for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update their own ScrapeClaw discovery discards" on public.scrapeclaw_discovery_discards;
create policy "Users can update their own ScrapeClaw discovery discards"
  on public.scrapeclaw_discovery_discards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own ScrapeClaw discovery discards" on public.scrapeclaw_discovery_discards;
create policy "Users can delete their own ScrapeClaw discovery discards"
  on public.scrapeclaw_discovery_discards for delete using (auth.uid() = user_id);
drop trigger if exists scrapeclaw_discovery_discards_updated_at on public.scrapeclaw_discovery_discards;
create trigger scrapeclaw_discovery_discards_updated_at
  before update on public.scrapeclaw_discovery_discards
  for each row execute function public.set_updated_at();
