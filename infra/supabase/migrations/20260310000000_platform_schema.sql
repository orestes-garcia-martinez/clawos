-- ─────────────────────────────────────────────────────────────────────────────
-- ClawOS — Platform Schema
-- Migration: 20260310000000_platform_schema.sql
--
-- Creates the three skill-agnostic platform tables:
--   users             — identity + tier cache
--   channel_identities — external channel ID → Supabase user mapping
--   sessions          — per-user-per-channel conversation context
--
-- RLS is enabled on every table. Users can only access their own rows.
-- No skill-specific columns live here. Skill tables are added in Chat 3+.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helpers ───────────────────────────────────────────────────────────────────

-- Automatically update updated_at on any row change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── users ─────────────────────────────────────────────────────────────────────
-- Mirrors auth.users 1-to-1. Created automatically when a new auth user signs up.
-- tier is a cached entitlement snapshot — Polar.sh is authoritative.
-- No skill-specific columns here.

create table public.users (
  id            uuid        primary key references auth.users (id) on delete cascade,
  email         text,
  name          text,
  tier          text        not null default 'free'
                            check (tier in ('free', 'pro')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Auto-create a users row when a new auth user is created.
-- The trigger runs as the postgres role so it can insert into public.users
-- even though the RLS policy would otherwise block it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.users enable row level security;

create policy "users: select own row"
  on public.users for select
  using (auth.uid() = id);

create policy "users: update own row"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ── channel_identities ────────────────────────────────────────────────────────
-- Maps external channel user IDs (Telegram, WhatsApp, etc.) to a canonical
-- Supabase Auth UUID. The unique constraint prevents one external ID from
-- mapping to two ClawOS accounts.

create table public.channel_identities (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.users (id) on delete cascade,
  channel         text        not null
                              check (channel in ('web', 'telegram', 'whatsapp')),
  channel_user_id text        not null,
  created_at      timestamptz not null default now(),

  -- A given external ID can only belong to one ClawOS user per channel.
  constraint channel_identities_unique_channel_user
    unique (channel, channel_user_id)
);

create index channel_identities_user_id_idx
  on public.channel_identities (user_id);

-- RLS
alter table public.channel_identities enable row level security;

create policy "channel_identities: select own rows"
  on public.channel_identities for select
  using (auth.uid() = user_id);

create policy "channel_identities: insert own rows"
  on public.channel_identities for insert
  with check (auth.uid() = user_id);

create policy "channel_identities: delete own rows"
  on public.channel_identities for delete
  using (auth.uid() = user_id);

-- ── sessions ──────────────────────────────────────────────────────────────────
-- One active session row per (user_id, channel). Stores conversation message
-- history only — {role, content, timestamp} arrays. No raw skill outputs.
--
-- Operational rules (enforced at the application layer, documented here):
--   - messages JSONB stores Message[] only: {role, content, timestamp}
--   - Hard cap: 20 messages max per session
--   - Skill output summaries only — never raw payloads
--   - Sessions inactive for 30 days are soft-deleted (deleted_at set)
--   - Pruning and token cap (8,000 tokens) applied at read time in the API

create table public.sessions (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users (id) on delete cascade,
  channel     text        not null
                          check (channel in ('web', 'telegram', 'whatsapp')),
  -- Message history: [{role: 'user'|'assistant', content: string, timestamp: string}]
  -- Application layer enforces: max 20 messages, summaries only, no raw skill output.
  messages    jsonb       not null default '[]'::jsonb,
  last_active timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  -- Soft-delete for 30-day expiry. Set by a scheduled job or on next access.
  deleted_at  timestamptz,

  -- One active session per user per channel.
  constraint sessions_unique_user_channel
    unique (user_id, channel)
);

-- Index for the 30-day expiry sweep (find inactive sessions efficiently).
create index sessions_last_active_idx
  on public.sessions (last_active)
  where deleted_at is null;

-- RLS
alter table public.sessions enable row level security;

create policy "sessions: select own rows"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "sessions: insert own rows"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "sessions: update own rows"
  on public.sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "sessions: delete own rows"
  on public.sessions for delete
  using (auth.uid() = user_id);
