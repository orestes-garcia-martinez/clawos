-- ============================================================================
-- Migration: 20260406000010_careerclaw_location_radius.sql
-- Adds location_radius_mi to careerclaw_profiles.
--
-- Design:
--   - Stored in miles (US-facing product; UI presents miles).
--   - The ClawOS worker adapter converts to km (× 1.60934) before passing
--     to careerclaw-js UserProfile.location_radius_km.
--   - The careerclaw-js engine applies the operator hard cap
--     (CAREERCLAW_SERPAPI_GOOGLE_JOBS_RADIUS_KM, default 161 km ≈ 100 mi).
--   - Only meaningful when work_mode is 'onsite' or 'hybrid'.
--   - NULL = use operator default (25 mi shown in UI, resolved by engine).
-- ============================================================================

alter table public.careerclaw_profiles
  add column if not exists location_radius_mi integer
    check (location_radius_mi is null or (location_radius_mi between 1 and 100));
