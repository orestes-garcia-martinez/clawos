// ─────────────────────────────────────────────────────────────────────────────
// CareerClaw DB row aliases — type shortcuts for CareerClaw Supabase tables.
//
// These aliases provide ergonomic access to the auto-generated database types
// for CareerClaw-specific tables (profiles, runs, job tracking).
// ─────────────────────────────────────────────────────────────────────────────

import type { Database } from '../../types/database.types.js'

export type CareerClawProfileRow = Database['public']['Tables']['careerclaw_profiles']['Row']
export type CareerClawProfileInsert = Database['public']['Tables']['careerclaw_profiles']['Insert']
export type CareerClawProfileUpdate = Database['public']['Tables']['careerclaw_profiles']['Update']

export type CareerClawRunRow = Database['public']['Tables']['careerclaw_runs']['Row']
export type CareerClawRunInsert = Database['public']['Tables']['careerclaw_runs']['Insert']

export type CareerClawJobTrackingRow =
  Database['public']['Tables']['careerclaw_job_tracking']['Row']
export type CareerClawJobTrackingInsert =
  Database['public']['Tables']['careerclaw_job_tracking']['Insert']
export type CareerClawJobTrackingUpdate =
  Database['public']['Tables']['careerclaw_job_tracking']['Update']
