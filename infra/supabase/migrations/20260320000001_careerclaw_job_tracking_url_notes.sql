-- Migration: add url and notes to careerclaw_job_tracking
-- Apply via Supabase dashboard SQL editor.

alter table public.careerclaw_job_tracking
  add column if not exists url   text null,
  add column if not exists notes text null;

alter table public.careerclaw_job_tracking
  add constraint careerclaw_job_tracking_url_check   check (url   is null or char_length(url)   <= 2000),
  add constraint careerclaw_job_tracking_notes_check check (notes is null or char_length(notes) <= 2000);
