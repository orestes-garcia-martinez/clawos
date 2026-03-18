-- ─────────────────────────────────────────────────────────────────────────────
-- ClawOS — Fix handle_new_user trigger
-- Migration: 20260317000005_fix_handle_new_user.sql
--
-- Problem: the original handle_new_user had two failure modes:
--   1. A plain INSERT throws a PK conflict if the trigger fires twice for the
--      same auth user (can happen with Supabase magic link two-phase flow).
--   2. Any exception was silently swallowed, leaving no row in public.users
--      and no trace in the logs.
--
-- Fix:
--   1. Replace INSERT with INSERT ... ON CONFLICT (id) DO UPDATE so the
--      trigger is idempotent regardless of how many times it fires.
--   2. Wrap in BEGIN/EXCEPTION so failures are surfaced as Postgres WARNING
--      log entries (visible in Supabase → Logs → Postgres) rather than
--      disappearing silently.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email;

  return new;

exception
  when others then
    raise warning
      'handle_new_user: failed to upsert public.users for auth user % (email: %): % %',
      new.id,
      new.email,
      sqlerrm,
      sqlstate;
    return new;
end;
$$;
