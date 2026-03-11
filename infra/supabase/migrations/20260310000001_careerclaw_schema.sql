-- ============================================================================
-- Migration: 20260310000001_careerclaw_schema.sql
-- CareerClaw skill tables — Pattern B (skill-owned, prefixed)
--
-- Rules (from Appendix A.2):
--   - Platform schema owns identity, session, billing. Nothing skill-specific.
--   - Each skill owns its own prefixed tables. RLS policies reference users.id.
--   - A user with no CareerClaw activity has zero careerclaw_* rows.
--   - Adding ScrapeClaw later = new scrapeclaw_* tables, zero changes here.
-- ============================================================================

-- ── careerclaw_profiles ─────────────────────────────────────────────────────
-- One row per user. Stores resume text (extracted plain text only — raw PDF
-- is discarded in memory and never persisted) and CareerClaw-specific prefs.

create table if not exists public.careerclaw_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  -- Resume: extracted text only. Raw PDF never stored. 50k char max.
  resume_text     text check (char_length(resume_text) <= 50000),
  work_mode       text check (work_mode in ('remote', 'hybrid', 'onsite')),
  salary_min      integer check (salary_min > 0 and salary_min <= 10000000),
  location_pref   text check (char_length(location_pref) <= 200),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- One profile per user
  unique (user_id)
);

-- RLS: users can only read/write their own profile row
alter table public.careerclaw_profiles enable row level security;

create policy "Users can view their own CareerClaw profile"
  on public.careerclaw_profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert their own CareerClaw profile"
  on public.careerclaw_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own CareerClaw profile"
  on public.careerclaw_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own CareerClaw profile"
  on public.careerclaw_profiles for delete
  using (auth.uid() = user_id);

-- Trigger: keep updated_at current
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger careerclaw_profiles_updated_at
  before update on public.careerclaw_profiles
  for each row execute function public.set_updated_at();


-- ── careerclaw_runs ──────────────────────────────────────────────────────────
-- Append-only run log per user. Never updated; only inserted.
-- Stores metadata only — no raw job payloads or resume text.

create table if not exists public.careerclaw_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  run_at      timestamptz not null default now(),
  job_count   integer not null default 0 check (job_count >= 0),
  top_score   numeric(6, 4) check (top_score >= 0 and top_score <= 1),
  -- 'success' | 'error' | 'no_matches'
  status      text not null check (status in ('success', 'error', 'no_matches')),
  duration_ms integer check (duration_ms >= 0)
);

-- RLS: users can only read their own run history
alter table public.careerclaw_runs enable row level security;

create policy "Users can view their own CareerClaw runs"
  on public.careerclaw_runs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own CareerClaw runs"
  on public.careerclaw_runs for insert
  with check (auth.uid() = user_id);

-- No UPDATE or DELETE policies — runs are append-only


-- ── careerclaw_job_tracking ──────────────────────────────────────────────────
-- Saved jobs per user. Status tracks the application pipeline.

create table if not exists public.careerclaw_job_tracking (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  -- Stable job ID from careerclaw-js (source + hash)
  job_id      text not null check (char_length(job_id) <= 200),
  title       text not null check (char_length(title) <= 300),
  company     text not null check (char_length(company) <= 300),
  -- Status progression: saved → applied → interviewing → offer → rejected
  status      text not null default 'saved'
                check (status in ('saved', 'applied', 'interviewing', 'offer', 'rejected')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- A user can only track a given job once
  unique (user_id, job_id)
);

-- RLS: users can only access their own tracked jobs
alter table public.careerclaw_job_tracking enable row level security;

create policy "Users can view their own tracked jobs"
  on public.careerclaw_job_tracking for select
  using (auth.uid() = user_id);

create policy "Users can insert their own tracked jobs"
  on public.careerclaw_job_tracking for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own tracked jobs"
  on public.careerclaw_job_tracking for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own tracked jobs"
  on public.careerclaw_job_tracking for delete
  using (auth.uid() = user_id);

create trigger careerclaw_job_tracking_updated_at
  before update on public.careerclaw_job_tracking
  for each row execute function public.set_updated_at();
