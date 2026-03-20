-- ============================================================================
-- Migration: 20260320000007_careerclaw_resume_uploaded_at.sql
--
-- Adds resume_uploaded_at to careerclaw_profiles.
-- This column is set explicitly by the API when resume_text is written,
-- keeping it independent from updated_at (which changes on any profile save).
-- ============================================================================

alter table public.careerclaw_profiles
  add column if not exists resume_uploaded_at timestamptz default null;
