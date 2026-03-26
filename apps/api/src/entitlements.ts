/**
 * entitlements.ts — skill entitlement resolution helpers.
 *
 * The API is the source of truth for platform -> worker entitlement assertions.
 * Each skill resolves its effective tier and feature list here before the API
 * issues a signed assertion to the worker.
 */

import { createServerClient } from '@clawos/shared'
import type { SkillSlug, Tier, TypedSupabaseClient } from '@clawos/shared'

export interface SkillEntitlements {
  platformTier: Tier
  skillTier: Tier
  effectiveTier: Tier
  features: string[]
}

const SKILL_FEATURES: Record<SkillSlug, { free: string[]; pro: string[] }> = {
  careerclaw: {
    free: [],
    pro: [
      'careerclaw.llm_outreach_draft',
      'careerclaw.tailored_cover_letter',
      'careerclaw.resume_gap_analysis',
      'careerclaw.topk_extended',
    ],
  },
}

function freeTierDefaults(skillSlug: SkillSlug): SkillEntitlements {
  return {
    platformTier: 'free',
    skillTier: 'free',
    effectiveTier: 'free',
    features: [...SKILL_FEATURES[skillSlug].free],
  }
}

export async function resolveSkillEntitlements(
  userId: string,
  skillSlug: SkillSlug,
  supabase?: TypedSupabaseClient,
): Promise<SkillEntitlements> {
  const db = supabase ?? createServerClient()

  try {
    const [usersResult, entitlementResult] = await Promise.all([
      db.from('users').select('tier').eq('id', userId).single(),
      db
        .from('user_skill_entitlements')
        .select('tier, status')
        .eq('user_id', userId)
        .eq('skill_slug', skillSlug)
        .maybeSingle(),
    ])

    const platformTier: Tier = usersResult.data?.tier === 'pro' ? 'pro' : 'free'

    const skillTier: Tier =
      entitlementResult.data?.tier === 'pro' && entitlementResult.data?.status === 'active'
        ? 'pro'
        : 'free'

    const effectiveTier: Tier = platformTier === 'pro' || skillTier === 'pro' ? 'pro' : 'free'

    const features =
      effectiveTier === 'pro'
        ? [...SKILL_FEATURES[skillSlug].pro]
        : [...SKILL_FEATURES[skillSlug].free]

    return {
      platformTier,
      skillTier,
      effectiveTier,
      features,
    }
  } catch {
    // Fail-safe behavior: if entitlement resolution fails, return free.
    // This avoids turning transient data-path issues into unauthorized Pro access.
    return freeTierDefaults(skillSlug)
  }
}

export function resolveCareerClawEntitlements(
  userId: string,
  supabase?: TypedSupabaseClient,
): Promise<SkillEntitlements> {
  return resolveSkillEntitlements(userId, 'careerclaw', supabase)
}
