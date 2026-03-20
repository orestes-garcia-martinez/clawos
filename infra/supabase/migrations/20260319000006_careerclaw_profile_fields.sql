-- ============================================================================
-- Migration: 20260319000006_careerclaw_profile_fields.sql
--
-- Adds structured profile extraction fields to careerclaw_profiles.
-- These are populated by the /resume/extract endpoint after Haiku parses
-- the resume text. They are the primary keyword corpus for careerclaw-js
-- matching — without skills/target_roles the engine returns zero matches.
--
-- All columns are nullable. Existing rows are unaffected.
-- ============================================================================

alter table public.careerclaw_profiles
  add column if not exists skills          text[]  default null,
  add column if not exists target_roles    text[]  default null,
  add column if not exists experience_years integer
    check (experience_years is null or (experience_years >= 0 and experience_years <= 60)),
  add column if not exists resume_summary  text
    check (resume_summary is null or char_length(resume_summary) <= 2000);
