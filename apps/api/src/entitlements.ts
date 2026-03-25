/**
 * entitlements.ts — Skill entitlement resolution from Supabase cache.
 *
 * Called by the chat route to determine Pro feature availability.
 * Reads only from Supabase — no Polar API call on the hot path.
 *
 * Performance note: the query hits the indexed (user_id) column on
 * user_skill_entitlements and is bounded to a single row per skill.
 * p99 latency from the same Lightsail region is <10ms.
 */

import { createServerClient } from '@clawos/shared'
import type { TypedSupabaseClient } from '@clawos/shared'

export interface CareerClawEntitlements {
  /** users.tier summary cache — backward-compatible with existing gating. */
  platformTier: 'free' | 'pro'
  /** Skill-scoped tier from user_skill_entitlements. */
  skillTier: 'free' | 'pro'
  /**
   * Feature flags for CareerClaw Pro.
   * Each flag mirrors a Pro-only capability gate in the chat route.
   */
  features: {
    llmOutreachDraft: boolean
    tailoredCoverLetter: boolean
    resumeGapAnalysis: boolean
    topKExtended: boolean
  }
}

/**
 * Resolve CareerClaw entitlements for the given user.
 *
 * Returns free-tier defaults on any Supabase error so that paying users
 * are never locked out due to a transient DB issue.
 *
 * @param userId   Supabase Auth UUID (already validated by requireAuth).
 * @param supabase Optional — pass an existing client to avoid creating a new one.
 */
export async function resolveCareerClawEntitlements(
  userId: string,
  supabase?: TypedSupabaseClient,
): Promise<CareerClawEntitlements> {
  const db = supabase ?? createServerClient()

  try {
    // Single query — reads both the platform tier cache and the skill row.
    const [usersResult, entitlementResult] = await Promise.all([
      db.from('users').select('tier').eq('id', userId).single(),
      db
        .from('user_skill_entitlements')
        .select('tier, status')
        .eq('user_id', userId)
        .eq('skill_slug', 'careerclaw')
        .maybeSingle(),
    ])

    const platformTier: 'free' | 'pro' = usersResult.data?.tier === 'pro' ? 'pro' : 'free'

    const skillTier: 'free' | 'pro' =
      entitlementResult.data?.tier === 'pro' && entitlementResult.data?.status === 'active'
        ? 'pro'
        : 'free'

    // The effective tier is the higher of the two — the summary cache and the
    // skill row should always agree after a webhook, but the dual check adds
    // resilience against a missed webhook delivery.
    const effectiveTier: 'free' | 'pro' =
      platformTier === 'pro' || skillTier === 'pro' ? 'pro' : 'free'

    const isPro = effectiveTier === 'pro'

    return {
      platformTier,
      skillTier: effectiveTier,
      features: {
        llmOutreachDraft: isPro,
        tailoredCoverLetter: isPro,
        resumeGapAnalysis: isPro,
        topKExtended: isPro,
      },
    }
  } catch {
    // Fail open — return free-tier defaults so paying users are not locked out.
    return freeTierDefaults()
  }
}

/** Free-tier defaults — used as safe fallback on any resolution error. */
function freeTierDefaults(): CareerClawEntitlements {
  return {
    platformTier: 'free',
    skillTier: 'free',
    features: {
      llmOutreachDraft: false,
      tailoredCoverLetter: false,
      resumeGapAnalysis: false,
      topKExtended: false,
    },
  }
}
