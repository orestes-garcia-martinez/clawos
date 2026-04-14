// ─────────────────────────────────────────────────────────────────────────────
// @clawos/shared — public API barrel.
//
// Thin re-export layer. All definitions live in their respective sub-modules:
//   platform/  — core domain types, API contracts, platform DB aliases
//   supabase/  — typed Supabase client factories
//   skills/    — skill contracts (common + careerclaw + scrapeclaw)
//
// Consumers import from '@clawos/shared' — this barrel ensures the public
// surface stays stable regardless of internal reorganisation.
// ─────────────────────────────────────────────────────────────────────────────

export * from './platform/index.js'
export * from './supabase/index.js'
export * from './skills/index.js'
export type { Json } from './types/database.types.js'
