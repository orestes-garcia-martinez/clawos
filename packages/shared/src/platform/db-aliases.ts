// ─────────────────────────────────────────────────────────────────────────────
// Platform DB row aliases — type shortcuts for platform-level Supabase tables.
// ─────────────────────────────────────────────────────────────────────────────

import type { Database } from '../types/database.types.js'

export type UserRow = Database['public']['Tables']['users']['Row']
export type UserInsert = Database['public']['Tables']['users']['Insert']
export type UserUpdate = Database['public']['Tables']['users']['Update']

export type ChannelIdentityRow = Database['public']['Tables']['channel_identities']['Row']
export type ChannelIdentityInsert = Database['public']['Tables']['channel_identities']['Insert']

export type SessionRow = Database['public']['Tables']['sessions']['Row']
export type SessionInsert = Database['public']['Tables']['sessions']['Insert']
export type SessionUpdate = Database['public']['Tables']['sessions']['Update']

export type BillingWebhookEventRow = Database['public']['Tables']['billing_webhook_events']['Row']
export type BillingWebhookEventInsert =
  Database['public']['Tables']['billing_webhook_events']['Insert']

export type UserSkillEntitlementRow = Database['public']['Tables']['user_skill_entitlements']['Row']
export type UserSkillEntitlementInsert =
  Database['public']['Tables']['user_skill_entitlements']['Insert']
export type UserSkillEntitlementUpdate =
  Database['public']['Tables']['user_skill_entitlements']['Update']
