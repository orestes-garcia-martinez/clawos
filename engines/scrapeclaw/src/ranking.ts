// ─────────────────────────────────────────────────────────────────────────────
// ScrapeClaw — Phase 4a — Production pre-rank.
//
// Sits between Google Places resolution and deterministic research. Decides
// which resolved candidates are worth research budget and in what order,
// using only signals available before any HTML fetch:
//
//   - Business name tokens (wedge fit, locality fit, out-of-scope patterns)
//   - Resolved canonical website URL (eligibility, hostname quality hints)
//   - Discovery metadata (primary vs fallback query, hub name)
//
// Scoring rules:
//   - nameWedgeScore: presence of wedge tokens in the name (bounded).
//   - localityScore: hub/city tokens present in the name or URL.
//   - websiteQualityScore: hostname shape — penalize free-host platforms,
//     deeply-nested paths, and very long hostnames.
//   - exclusionPenalty: HOA/community-association name patterns. Heavy
//     negative weight per Q4 — demotes rather than excludes so the
//     deterministic research pass remains the final judge.
//   - queryQualityScore: small bump for primary queries over fallback.
//
// Hard exclusion (`excluded: true`) is reserved for ineligible URLs only.
// All wedge-fit decisions are soft demotions.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ScrapeClawPreRankBreakdown,
  ScrapeClawPreRankCandidate,
  ScrapeClawPreRankDiscarded,
  ScrapeClawPreRankResult,
  ScrapeClawWedgeSlug,
} from '@clawos/shared'
import {
  SCRAPECLAW_PRE_RANK_NAME_WEDGE_TOKENS,
  SCRAPECLAW_PRE_RANK_OUT_OF_SCOPE_NAME_PATTERNS,
  SCRAPECLAW_PRE_RANK_WEIGHTS,
} from './constants.js'
import { evaluateUrlEligibility } from './url-eligibility.js'
import type { ScrapeClawResolvedWebsiteCandidate } from './types.js'

/** Tokens that suggest a free-host platform — not a paid business presence. */
const FREE_HOST_SUFFIXES = [
  'wixsite.com',
  'weebly.com',
  'webs.com',
  'godaddysites.com',
  'business.site',
  'square.site',
  'sites.google.com',
  'blogspot.com',
] as const

function isFreeHost(host: string): boolean {
  return FREE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function round4(n: number): number {
  return Number(n.toFixed(4))
}

/**
 * Collapse a URL's hostname into a compact, separator-free form for substring
 * matching. Strips www., the TLD, and all hyphens/dots/underscores so that
 * space-separated tokens like "orange park" can match domain names like
 * "orangeparkpropertymanagementinc.com" after the caller normalises the token
 * the same way (strip spaces/punctuation).
 */
function normalizeHostname(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    return host.replace(/\.[^.]+$/, '').replace(/[-_.]/g, '')
  } catch {
    return ''
  }
}

/** 0–1 score for wedge tokens present in the name. Saturates at 3 distinct tokens. */
function scoreNameWedge(nameLower: string): { score: number; matched: string[] } {
  const matched = SCRAPECLAW_PRE_RANK_NAME_WEDGE_TOKENS.filter((t) => nameLower.includes(t))
  const score = clamp01(matched.length / 3)
  return { score, matched: [...matched] }
}

/** 0–1 locality score — does the name or URL contain any hub/locality token? */
function scoreLocality(
  nameLower: string,
  urlLower: string,
  hubName: string,
): {
  score: number
  matched: string[]
} {
  // TODO(wedge-2): 'clay county', 'florida', ', fl' are hardcoded for the
  // residential_property_management / Clay County market. When a second market
  // or wedge ships, replace these literals with per-market locality token lists
  // (analogous to SCRAPECLAW_PRE_RANK_NAME_WEDGE_TOKENS) derived from the
  // RunPreRankInput so scoreLocality stays market-agnostic.
  const tokens = [hubName.toLowerCase(), 'clay county', 'florida', ', fl']
  const hostNorm = normalizeHostname(urlLower)
  const matched = tokens.filter((t) => {
    if (nameLower.includes(t) || urlLower.includes(t)) return true
    // Also check the separator-collapsed hostname so tokens like "orange park"
    // match domain names like "orangeparkpropertymanagementinc.com".
    // Tokens that normalize to < 4 chars (e.g. ", fl" → "fl") are skipped
    // to avoid false positives on short substrings.
    const tNorm = t.replace(/[,\s]+/g, '')
    return tNorm.length >= 4 && hostNorm.includes(tNorm)
  })
  return { score: clamp01(matched.length / 2), matched }
}

/** 0–1 website quality. Penalizes free hosts and overly deep paths. */
function scoreWebsiteQuality(url: string): { score: number; signals: string[] } {
  const signals: string[] = []
  let score = 0.7 // baseline for any resolved URL

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { score: 0, signals: ['unparseable_url'] }
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')

  if (isFreeHost(host)) {
    score -= 0.4
    signals.push('free_host_platform')
  }

  // Reward short, clean hostnames; penalize very long or hyphen-heavy ones.
  if (host.length <= 20) {
    score += 0.15
    signals.push('short_hostname')
  } else if (host.length > 40) {
    score -= 0.1
    signals.push('long_hostname')
  }
  if ((host.match(/-/g) ?? []).length >= 3) {
    score -= 0.1
    signals.push('hyphen_heavy_hostname')
  }

  // Penalize paths that suggest a landing page rather than a real homepage.
  // Place Details returns two problematic shapes:
  //   deep_path: multi-segment paths like "agents/123/listings/abc"
  //   landing_slug_path: single segment with 3+ hyphens like
  //     "/orange-park-middleburg-office" (4 words → 3 hyphens)
  // Note: 2-hyphen city slugs like "/green-cove-springs" are NOT penalized.
  const pathSegments = parsed.pathname.split('/').filter(Boolean)
  if (pathSegments.length >= 3) {
    score -= 0.15
    signals.push('deep_path')
  } else if (pathSegments.length === 1 && (pathSegments[0]!.match(/-/g) ?? []).length >= 3) {
    score -= 0.15
    signals.push('landing_slug_path')
  }

  return { score: clamp01(score), signals }
}

/** Negative penalty for out-of-scope name or URL patterns. Returns 0 or a negative number. */
function scoreExclusion(
  nameLower: string,
  urlLower: string,
  wedgeSlug: ScrapeClawWedgeSlug,
): { penalty: number; matched: string[] } {
  // Per-wedge gating: only the residential-PM wedge demotes HOA/community
  // patterns today. When wedge #2 lands this branches into a wedge profile.
  if (wedgeSlug !== 'residential_property_management') {
    return { penalty: 0, matched: [] }
  }
  // Check both the business name and the separator-collapsed hostname.
  // Multi-word patterns like "homeowners association" are normalized to
  // "homeownersassociation" for URL matching so domains like
  // "glenhavenhoa.com" ("hoa") are caught even when the business name
  // uses a generic phrase like "Professional Community Management".
  const hostNorm = normalizeHostname(urlLower)
  const matched = SCRAPECLAW_PRE_RANK_OUT_OF_SCOPE_NAME_PATTERNS.filter((p) => {
    if (nameLower.includes(p)) return true
    const pNorm = p.replace(/\s+/g, '')
    // Short patterns (e.g. "hoa" → 3 chars) are too broad for a plain
    // substring match: "shoalcreekpm.com" normalises to "shoalcreekpm" which
    // contains "hoa" as an accidental interior sequence.
    // HOA-convention domains always end with the abbreviation
    // ("glenhavenhoa.com", "sunsetridgehoa.com"), so an end-anchor is both
    // correct for the intended case and safe against false positives.
    if (pNorm.length < 5) return hostNorm.endsWith(pNorm)
    return hostNorm.includes(pNorm)
  })
  if (matched.length === 0) return { penalty: 0, matched: [] }
  // Apply the full penalty per match; no compounding boost beyond the first.
  // Per Q4: heavy demotion, not exclusion. Final score is clamped to [0, 1]
  // so a strong PM-named HOA can still surface above zero.
  return {
    penalty: -SCRAPECLAW_PRE_RANK_WEIGHTS.outOfScopePenalty * Math.min(matched.length, 1),
    matched: [...matched],
  }
}

function buildRationale(args: {
  preRankScore: number
  breakdown: ScrapeClawPreRankBreakdown
  wedgeMatches: string[]
  localityMatches: string[]
  websiteSignals: string[]
  exclusionMatches: string[]
}): string[] {
  const lines: string[] = [`Pre-rank score: ${args.preRankScore.toFixed(3)}`]
  if (args.wedgeMatches.length > 0) {
    lines.push(
      `Wedge tokens in name (+${args.breakdown.nameWedgeScore.toFixed(2)}): ${args.wedgeMatches.join(', ')}`,
    )
  } else {
    lines.push('No wedge tokens in business name (+0.00)')
  }
  if (args.localityMatches.length > 0) {
    lines.push(
      `Locality signals (+${args.breakdown.localityScore.toFixed(2)}): ${args.localityMatches.join(', ')}`,
    )
  }
  if (args.websiteSignals.length > 0) {
    lines.push(
      `Website quality (+${args.breakdown.websiteQualityScore.toFixed(2)}): ${args.websiteSignals.join(', ')}`,
    )
  }
  if (args.exclusionMatches.length > 0) {
    lines.push(
      `Out-of-scope pattern (${args.breakdown.exclusionPenalty.toFixed(2)}): ${args.exclusionMatches.join(', ')}`,
    )
  }
  if (args.breakdown.queryQualityScore > 0) {
    lines.push(`Primary discovery query (+${args.breakdown.queryQualityScore.toFixed(2)})`)
  }
  return lines
}

export interface RunPreRankInput {
  candidates: ScrapeClawResolvedWebsiteCandidate[]
  wedgeSlug: ScrapeClawWedgeSlug
}

/**
 * Score and order candidates before research selection.
 *
 * Discards (URL ineligibility) appear in `discarded` with their eligibility
 * decision attached. Out-of-scope candidates are demoted but still ranked,
 * so a name-pattern-positive site that is actually a property manager gets
 * a chance to be confirmed by deterministic research.
 */
export function runScrapeClawProductionPreRank(input: RunPreRankInput): ScrapeClawPreRankResult {
  const ranked: ScrapeClawPreRankCandidate[] = []
  const discarded: ScrapeClawPreRankDiscarded[] = []

  for (const candidate of input.candidates) {
    const eligibility = evaluateUrlEligibility(candidate.websiteUri)
    if (!eligibility.eligible || !eligibility.normalizedUrl) {
      discarded.push({
        name: candidate.name,
        originalUrl: candidate.websiteUri,
        eligibility,
        reason: eligibility.rationale ?? 'URL rejected by eligibility check',
      })
      continue
    }

    const nameLower = candidate.name.toLowerCase()
    const urlLower = eligibility.normalizedUrl.toLowerCase()

    const wedge = scoreNameWedge(nameLower)
    const locality = scoreLocality(nameLower, urlLower, candidate.hubName)
    const website = scoreWebsiteQuality(eligibility.normalizedUrl)
    const exclusion = scoreExclusion(nameLower, urlLower, input.wedgeSlug)
    const queryQuality = candidate.queryKind === 'primary' ? 1 : 0

    const W = SCRAPECLAW_PRE_RANK_WEIGHTS
    const breakdown: ScrapeClawPreRankBreakdown = {
      nameWedgeScore: round4(wedge.score * W.nameWedge),
      localityScore: round4(locality.score * W.locality),
      websiteQualityScore: round4(website.score * W.websiteQuality),
      exclusionPenalty: round4(exclusion.penalty),
      queryQualityScore: round4(queryQuality * W.queryQuality),
    }

    const preRankScore = clamp01(
      breakdown.nameWedgeScore +
        breakdown.localityScore +
        breakdown.websiteQualityScore +
        breakdown.queryQualityScore +
        breakdown.exclusionPenalty,
    )

    ranked.push({
      name: candidate.name,
      canonicalWebsiteUrl: eligibility.normalizedUrl,
      placeId: candidate.placeId,
      hubName: candidate.hubName,
      queryKind: candidate.queryKind,
      preRankScore: round4(preRankScore),
      scoreBreakdown: breakdown,
      rationale: buildRationale({
        preRankScore: round4(preRankScore),
        breakdown,
        wedgeMatches: wedge.matched,
        localityMatches: locality.matched,
        websiteSignals: website.signals,
        exclusionMatches: exclusion.matched,
      }),
      excluded: false,
      exclusionReason: null,
    })
  }

  ranked.sort((a, b) => b.preRankScore - a.preRankScore)

  return {
    ranked,
    discarded,
    generatedAt: new Date().toISOString(),
  }
}
