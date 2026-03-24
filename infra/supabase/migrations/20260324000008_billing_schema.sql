-- ─────────────────────────────────────────────────────────────────────────────
-- ClawOS — Billing Schema
-- Migration: 20260324000008_billing_schema.sql
--
-- Creates:
--   billing_webhook_events   — idempotency log for Polar.sh webhook deliveries
--   user_skill_entitlements  — skill-scoped Pro entitlements per user
--
-- users.tier remains as the backward-compatible summary cache (free | pro).
-- It is updated by the webhook handler after writing to user_skill_entitlements.
--
-- RLS is enabled on both tables. Only the service role (backend) writes here;
-- authenticated users can read their own rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── billing_webhook_events ────────────────────────────────────────────────────
-- Idempotency + audit log for every Polar.sh webhook delivery.
-- event_id is the Polar webhook event ID — unique constraint prevents double-processing.
-- payload is stored for replay/support debugging. Never queried by the hot path.

create table public.billing_webhook_events (
  event_id       text        primary key,
  event_type     text        not null,
  received_at    timestamptz not null default now(),
  processed_at   timestamptz,
  status         text        not null check (status in ('processing', 'processed', 'ignored', 'error')),
  error          text,
  payload        jsonb
);

-- Only backend (service role) can write. Authenticated users cannot read their
-- own webhook events — this table is internal.
alter table public.billing_webhook_events enable row level security;

-- No SELECT policy for authenticated users — service role bypasses RLS.
-- (No user-facing read needed for MVP.)

-- ── user_skill_entitlements ───────────────────────────────────────────────────
-- Skill-scoped billing entitlements. One row per (user, skill).
-- Written by the webhook handler; read by the entitlements helper on the hot path.
-- The unique constraint on (user_id, skill_slug) allows safe upsert.

create table public.user_skill_entitlements (
  id                             uuid        primary key default gen_random_uuid(),
  user_id                        uuid        not null references auth.users (id) on delete cascade,
  skill_slug                     text        not null,
  tier                           text        not null default 'free'
                                             check (tier in ('free', 'pro')),
  status                         text        not null default 'inactive',
  provider                       text        not null default 'polar',
  provider_product_id            text,
  provider_subscription_id       text,
  provider_customer_external_id  text,
  period_ends_at                 timestamptz,
  metadata                       jsonb       not null default '{}'::jsonb,
  updated_at                     timestamptz not null default now(),

  unique (user_id, skill_slug)
);

create index idx_user_skill_entitlements_user_id
  on public.user_skill_entitlements (user_id);

create trigger user_skill_entitlements_set_updated_at
  before update on public.user_skill_entitlements
  for each row execute function public.set_updated_at();

alter table public.user_skill_entitlements enable row level security;

-- Users can read their own entitlement rows (needed by the web frontend
-- to poll for Pro status after checkout redirect).
create policy "users_select_own_entitlements"
  on public.user_skill_entitlements
  for select
  using (auth.uid() = user_id);

-- Only the service role writes (insert / update / delete). The webhook handler
-- and sync endpoint run with the service role key and bypass RLS.

-- ── Helper: recompute users.tier from user_skill_entitlements ─────────────────
-- Called after every entitlement upsert to keep users.tier in sync.
-- users.tier = 'pro' if any skill entitlement row has tier = 'pro'.
-- This is a database-level safety net; the API handler also updates users.tier.

create or replace function public.refresh_user_tier(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier text;
begin
  select coalesce(
    max(case when tier = 'pro' then 'pro' else null end),
    'free'
  )
  into v_tier
  from public.user_skill_entitlements
  where user_id = p_user_id;

  update public.users
  set tier = v_tier
  where id = p_user_id;
end;
$$;
