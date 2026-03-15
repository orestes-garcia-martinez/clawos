-- ─────────────────────────────────────────────────────────────────────────────
-- ClawOS — user_skills
-- Migration: 20260315000004_user_skills.sql
--
-- Platform-owned table tracking which first-party skills each user has
-- installed. The skill registry (apps/web/src/skills/index.ts) defines what
-- is available to install; this table records per-user state.
--
-- Constraints:
--   - One row per (user_id, skill_slug). Reinstalling a skill is an upsert.
--   - status CHECK prevents unknown values at the DB layer.
--   - is_default: the skill that receives auth redirects when multiple are
--     installed. Managed at the application layer — DB does not enforce
--     at-most-one default per user (app sets it on first install).
--
-- RLS: users can only read, insert, update, and delete their own rows.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.user_skills (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.users (id) on delete cascade,
  skill_slug   text        not null,
  status       text        not null default 'installed'
                           check (status in ('installed', 'paused')),
  installed_at timestamptz not null default now(),
  last_used_at timestamptz,
  is_default   boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint user_skills_unique_user_slug unique (user_id, skill_slug)
);

create trigger user_skills_set_updated_at
  before update on public.user_skills
  for each row execute function public.set_updated_at();

create index user_skills_user_id_idx
  on public.user_skills (user_id);

-- RLS
alter table public.user_skills enable row level security;

create policy "user_skills: select own rows"
  on public.user_skills for select
  using (auth.uid() = user_id);

create policy "user_skills: insert own rows"
  on public.user_skills for insert
  with check (auth.uid() = user_id);

create policy "user_skills: update own rows"
  on public.user_skills for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_skills: delete own rows"
  on public.user_skills for delete
  using (auth.uid() = user_id);

-- ── Backfill ──────────────────────────────────────────────────────────────────
-- All users who existed before this migration are assumed to have CareerClaw.
-- New users start with zero skills and land on /home to choose their first.
-- The ON CONFLICT clause makes this idempotent if re-run.

insert into public.user_skills (user_id, skill_slug, is_default)
select id, 'careerclaw', true
from public.users
on conflict (user_id, skill_slug) do nothing;
