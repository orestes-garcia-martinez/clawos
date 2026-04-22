import { describe, expect, it } from 'vitest'
import { runScrapeClawProductionPreRank } from './ranking.js'
import type { ScrapeClawResolvedWebsiteCandidate } from './types.js'

function candidate(
  overrides: Partial<ScrapeClawResolvedWebsiteCandidate>,
): ScrapeClawResolvedWebsiteCandidate {
  return {
    provider: 'google_places',
    placeId: overrides.placeId ?? 'place-default',
    name: overrides.name ?? 'Default Business',
    formattedAddress: overrides.formattedAddress ?? '1 Main St, Orange Park, FL 32073, USA',
    hubName: overrides.hubName ?? 'Orange Park',
    queryKind: overrides.queryKind ?? 'primary',
    queryText: overrides.queryText ?? 'Property Management in Orange Park, FL',
    websiteUri: overrides.websiteUri ?? 'https://default.example/',
  }
}

describe('runScrapeClawProductionPreRank', () => {
  it('ranks property-management names above unrelated names', () => {
    const result = runScrapeClawProductionPreRank({
      wedgeSlug: 'residential_property_management',
      candidates: [
        candidate({
          placeId: 'pm',
          name: 'Clay County Property Management',
          websiteUri: 'https://claycopm.com/',
        }),
        candidate({
          placeId: 'misc',
          name: 'Bob Smith Realty Co',
          websiteUri: 'https://bobsmith.example/',
        }),
        candidate({
          placeId: 'unrelated',
          name: 'Sunshine Tax Services',
          websiteUri: 'https://sunshinetax.example/',
        }),
      ],
    })
    expect(result.ranked).toHaveLength(3)
    expect(result.ranked[0]?.name).toBe('Clay County Property Management')
    expect(result.ranked[0]!.preRankScore).toBeGreaterThan(result.ranked[2]!.preRankScore)
  })

  it('demotes HOA / community-association names with a heavy negative weight', () => {
    const result = runScrapeClawProductionPreRank({
      wedgeSlug: 'residential_property_management',
      candidates: [
        candidate({
          placeId: 'pm',
          name: 'Acme Property Management',
          websiteUri: 'https://acmepm.com/',
        }),
        candidate({
          placeId: 'hoa',
          name: 'Sunset Ridge Homeowners Association',
          websiteUri: 'https://sunsetridgehoa.com/',
        }),
      ],
    })
    expect(result.ranked[0]?.name).toBe('Acme Property Management')
    const hoa = result.ranked.find((c) => c.placeId === 'hoa')
    expect(hoa).toBeDefined()
    expect(hoa!.scoreBreakdown.exclusionPenalty).toBeLessThan(0)
    // Per Q4: demote, not exclude. The HOA is still present in `ranked`.
    expect(result.discarded.find((d) => d.name.includes('Homeowners'))).toBeUndefined()
  })

  it('discards ineligible URLs before ranking', () => {
    const result = runScrapeClawProductionPreRank({
      wedgeSlug: 'residential_property_management',
      candidates: [
        candidate({
          placeId: 'good',
          name: 'Good Property Management',
          websiteUri: 'https://goodpm.com/',
        }),
        candidate({
          placeId: 'social',
          name: 'Social Property Management',
          websiteUri: 'https://www.facebook.com/somepage',
        }),
        candidate({
          placeId: 'malformed',
          name: 'Malformed Property Management',
          websiteUri: 'not-a-url',
        }),
      ],
    })
    expect(result.ranked.find((c) => c.placeId === 'good')).toBeDefined()
    expect(result.ranked.find((c) => c.placeId === 'social')).toBeUndefined()
    expect(result.ranked.find((c) => c.placeId === 'malformed')).toBeUndefined()
    expect(result.discarded).toHaveLength(2)
    const reasons = result.discarded.map((d) => d.eligibility?.reason)
    expect(reasons).toContain('forbidden_host_pattern')
    expect(reasons).toContain('malformed_url')
  })

  it('gives a small primary-query bump as tiebreaker only', () => {
    const result = runScrapeClawProductionPreRank({
      wedgeSlug: 'residential_property_management',
      candidates: [
        candidate({
          placeId: 'fallback-strong',
          // Two wedge tokens ("property management" + "rentals") on the
          // fallback side.
          name: 'Acme Property Management & Rentals',
          websiteUri: 'https://acmepm.com/',
          queryKind: 'fallback',
        }),
        candidate({
          placeId: 'primary-weak',
          // One weak wedge token ("realty") on the primary side.
          name: 'Weak Realty',
          websiteUri: 'https://weak.example/',
          queryKind: 'primary',
        }),
      ],
    })
    // The strong-named fallback should still beat the weak-named primary:
    // the +queryQuality bump is intentionally small enough to only flip
    // otherwise-tied scores.
    expect(result.ranked[0]?.placeId).toBe('fallback-strong')
  })

  it('returns rationale for every ranked candidate', () => {
    const result = runScrapeClawProductionPreRank({
      wedgeSlug: 'residential_property_management',
      candidates: [
        candidate({
          placeId: 'pm',
          name: 'Acme Property Management',
          websiteUri: 'https://acmepm.com/',
        }),
      ],
    })
    expect(result.ranked[0]?.rationale.length).toBeGreaterThanOrEqual(2)
    expect(result.ranked[0]?.rationale[0]).toContain('Pre-rank score')
  })

  it('normalizes URLs through eligibility (https upgrade, lowercase host)', () => {
    const result = runScrapeClawProductionPreRank({
      wedgeSlug: 'residential_property_management',
      candidates: [
        candidate({
          placeId: 'mixed-case',
          name: 'MixedCase PM',
          websiteUri: 'http://WWW.MixedCasePM.com/',
        }),
      ],
    })
    expect(result.ranked[0]?.canonicalWebsiteUrl).toBe('https://mixedcasepm.com/')
  })

  it('credits locality when the hub city appears concatenated in the URL hostname', () => {
    // "orange park" with a space won't substring-match "orangepark..." directly;
    // the normalizeHostname path should bridge that gap.
    const result = runScrapeClawProductionPreRank({
      wedgeSlug: 'residential_property_management',
      candidates: [
        candidate({
          placeId: 'url-local',
          name: 'Sunshine Management', // no locality tokens in name
          websiteUri: 'https://orangeparkpropertymanagementinc.com/',
          hubName: 'Orange Park',
        }),
        candidate({
          placeId: 'no-local',
          name: 'Sunshine Management',
          websiteUri: 'https://shinepm.com/',
          hubName: 'Orange Park',
        }),
      ],
    })
    const urlLocal = result.ranked.find((c) => c.placeId === 'url-local')
    const noLocal = result.ranked.find((c) => c.placeId === 'no-local')
    expect(urlLocal).toBeDefined()
    expect(noLocal).toBeDefined()
    expect(urlLocal!.scoreBreakdown.localityScore).toBeGreaterThan(
      noLocal!.scoreBreakdown.localityScore,
    )
  })

  it('demotes candidates whose domain reveals an HOA even when the name does not', () => {
    const result = runScrapeClawProductionPreRank({
      wedgeSlug: 'residential_property_management',
      candidates: [
        candidate({
          placeId: 'pm',
          name: 'Acme Property Management',
          websiteUri: 'https://acmepm.com/',
        }),
        candidate({
          placeId: 'hoa-url',
          // Name uses generic phrasing that bypasses the name-only exclusion check.
          name: 'Glen Haven Community Services',
          websiteUri: 'https://glenhavenhoa.com/',
        }),
      ],
    })
    const hoaUrl = result.ranked.find((c) => c.placeId === 'hoa-url')
    const pm = result.ranked.find((c) => c.placeId === 'pm')
    expect(hoaUrl).toBeDefined()
    expect(hoaUrl!.scoreBreakdown.exclusionPenalty).toBeLessThan(0)
    expect(pm!.preRankScore).toBeGreaterThan(hoaUrl!.preRankScore)
  })

  it('penalizes a single-segment path with 3+ hyphens as a landing-page slug', () => {
    const result = runScrapeClawProductionPreRank({
      wedgeSlug: 'residential_property_management',
      candidates: [
        candidate({
          placeId: 'homepage',
          name: 'Watson Realty Property Management',
          websiteUri: 'https://watsonrent.com/',
        }),
        candidate({
          placeId: 'slug',
          name: 'Watson Realty Property Management',
          websiteUri: 'https://watsonrent.com/orange-park-middleburg-office',
        }),
      ],
    })
    const homepage = result.ranked.find((c) => c.placeId === 'homepage')
    const slug = result.ranked.find((c) => c.placeId === 'slug')
    expect(homepage).toBeDefined()
    expect(slug).toBeDefined()
    expect(slug!.rationale.some((r) => r.includes('landing_slug_path'))).toBe(true)
    expect(homepage!.preRankScore).toBeGreaterThan(slug!.preRankScore)
  })
})
