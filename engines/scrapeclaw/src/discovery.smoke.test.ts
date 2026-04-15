/**
 * Smoke test for Google Places discovery helpers.
 *
 * Requires a real API key — skipped automatically when the env var is absent:
 *
 *   SCRAPECLAW_GOOGLE_PLACES_API_KEY=<key> npx vitest run discovery.smoke.test.ts
 *
 * What is covered:
 *   1. textSearchGooglePlaces — real Places API text-search call
 *   2. getGooglePlaceDetails  — real Place Details call for the first result
 *   3. discoverPlaceSeeds     — end-to-end hub discovery for one hub
 *   4. resolvePlaceSeedWebsite — real Place Details website resolution
 *
 * Assertions are minimal by design (smoke, not contract): we verify that the API
 * responds, that the shapes we parse are non-empty, and that our dedup Map works
 * against a real result set.
 */

import { describe, expect, it } from 'vitest'
import { getGooglePlaceDetails, textSearchGooglePlaces } from './google-places.js'
import { discoverPlaceSeeds, resolvePlaceSeedWebsite } from './discovery.js'
import {
  SCRAPECLAW_CLAY_COUNTY_BOUNDING_BOX,
  SCRAPECLAW_DEFAULT_TEXT_SEARCH_PAGE_SIZE,
} from './constants.js'

const API_KEY = process.env['SCRAPECLAW_GOOGLE_PLACES_API_KEY']

const itLive = API_KEY ? it : it.skip

describe.skipIf(!API_KEY)('Google Places smoke tests (live — requires API key)', () => {
  // ── 1. textSearchGooglePlaces ──────────────────────────────────────────────

  itLive(
    'textSearchGooglePlaces returns at least one result for a known Clay County query',
    async () => {
      const response = await textSearchGooglePlaces(fetch, {
        apiKey: API_KEY!,
        textQuery: 'Property Management in Orange Park, FL',
        pageSize: SCRAPECLAW_DEFAULT_TEXT_SEARCH_PAGE_SIZE,
        locationRestriction: { rectangle: SCRAPECLAW_CLAY_COUNTY_BOUNDING_BOX },
      })

      expect(Array.isArray(response.places)).toBe(true)
      expect(response.places!.length).toBeGreaterThan(0)

      const first = response.places![0]!
      expect(typeof first.id).toBe('string')
      expect(first.id.length).toBeGreaterThan(0)
      expect(first.displayName?.text).toBeTruthy()
    },
  )

  // ── 2. getGooglePlaceDetails ───────────────────────────────────────────────

  itLive(
    'getGooglePlaceDetails returns display name and address for a known place id',
    async () => {
      // Fetch a real place ID first so the test is self-contained.
      const searchResponse = await textSearchGooglePlaces(fetch, {
        apiKey: API_KEY!,
        textQuery: 'Property Management in Orange Park, FL',
        pageSize: 1,
        locationRestriction: { rectangle: SCRAPECLAW_CLAY_COUNTY_BOUNDING_BOX },
      })

      const placeId = searchResponse.places?.[0]?.id
      expect(placeId).toBeTruthy()

      const details = await getGooglePlaceDetails(fetch, {
        apiKey: API_KEY!,
        placeId: placeId!,
      })

      expect(details.id).toBe(placeId)
      expect(details.displayName?.text).toBeTruthy()
      // websiteUri is optional — just confirm the shape is returned without throwing
      if (details.websiteUri) {
        expect(details.websiteUri).toMatch(/^https?:\/\//)
      }
    },
  )

  // ── 3. discoverPlaceSeeds end-to-end ──────────────────────────────────────

  itLive('discoverPlaceSeeds runs a single-hub query and returns deduplicated seeds', async () => {
    const result = await discoverPlaceSeeds(
      {
        mode: 'discover',
        wedgeSlug: 'residential_property_management',
        marketRegion: 'Clay County',
        hubNames: ['Orange Park'],
        minPrimaryResultsBeforeFallback: 1, // ensure primary is enough; avoid fallback
      },
      { apiKey: API_KEY! },
    )

    expect(result.plannedQueries.length).toBeGreaterThanOrEqual(1)
    expect(result.plannedQueries[0]?.queryKind).toBe('primary')

    // Seeds must be non-empty and each placeId unique
    expect(result.placeSeeds.length).toBeGreaterThan(0)
    const ids = result.placeSeeds.map((s) => s.placeId)
    expect(new Set(ids).size).toBe(ids.length)

    // Verify seed shape
    const seed = result.placeSeeds[0]!
    expect(seed.provider).toBe('google_places')
    expect(seed.placeId).toBeTruthy()
    expect(seed.name).toBeTruthy()
    expect(seed.hubName).toBe('Orange Park')
    expect(seed.queryKind).toBe('primary')
  })

  itLive(
    'discoverPlaceSeeds triggers a fallback query when primary results are below threshold',
    async () => {
      const result = await discoverPlaceSeeds(
        {
          mode: 'discover',
          wedgeSlug: 'residential_property_management',
          marketRegion: 'Clay County',
          hubNames: ['Orange Park'],
          minPrimaryResultsBeforeFallback: 999, // impossible threshold — always triggers fallback
        },
        { apiKey: API_KEY! },
      )

      expect(result.plannedQueries.length).toBe(2)
      expect(result.plannedQueries[1]?.queryKind).toBe('fallback')
      expect(result.placeSeeds.length).toBeGreaterThan(0)
    },
  )

  // ── 4. resolvePlaceSeedWebsite ─────────────────────────────────────────────

  itLive('resolvePlaceSeedWebsite returns a websiteUri or null without throwing', async () => {
    const searchResponse = await textSearchGooglePlaces(fetch, {
      apiKey: API_KEY!,
      textQuery: 'Property Management in Orange Park, FL',
      pageSize: 3,
      locationRestriction: { rectangle: SCRAPECLAW_CLAY_COUNTY_BOUNDING_BOX },
    })

    const seeds = (searchResponse.places ?? []).map((p) => ({
      provider: 'google_places' as const,
      placeId: p.id,
      name: p.displayName?.text?.trim() ?? 'Unknown',
      formattedAddress: p.formattedAddress ?? null,
      hubName: 'Orange Park',
      queryKind: 'primary' as const,
      queryText: 'Property Management in Orange Park, FL',
    }))

    expect(seeds.length).toBeGreaterThan(0)

    // Resolve first seed — whatever the API returns is fine as long as it doesn't throw
    const resolved = await resolvePlaceSeedWebsite(seeds[0]!, { apiKey: API_KEY! })

    if (resolved !== null) {
      expect(resolved.websiteUri).toMatch(/^https?:\/\//)
      expect(resolved.placeId).toBe(seeds[0]!.placeId)
    }
    // resolved === null is also valid (business has no website in Places)
  })
})
