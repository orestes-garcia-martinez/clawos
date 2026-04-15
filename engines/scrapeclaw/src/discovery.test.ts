import { describe, expect, it } from 'vitest'
import {
  discoverPlaceSeeds,
  planClayCountyDiscoveryQueries,
  resolvePlaceSeedWebsite,
} from './discovery.js'

function buildDiscoveryFetchMock() {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

    if (url.endsWith(':searchText')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { textQuery?: string }
      const query = body.textQuery ?? ''

      if (query === 'Property Management in Orange Park, FL') {
        return new Response(
          JSON.stringify({
            places: [
              {
                id: 'place-1',
                displayName: { text: 'Alpha PM' },
                formattedAddress: '1 Main St, Orange Park, FL 32073, USA',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      if (query === 'Real Estate Agency in Orange Park, FL') {
        return new Response(
          JSON.stringify({
            places: [
              {
                id: 'place-1',
                displayName: { text: 'Alpha PM' },
                formattedAddress: '1 Main St, Orange Park, FL 32073, USA',
              },
              {
                id: 'place-2',
                displayName: { text: 'Beta Realty' },
                formattedAddress: '2 Main St, Orange Park, FL 32073, USA',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      return new Response(JSON.stringify({ places: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    if (url.endsWith('/place-1')) {
      return new Response(
        JSON.stringify({
          id: 'place-1',
          displayName: { text: 'Alpha PM' },
          formattedAddress: '1 Main St, Orange Park, FL 32073, USA',
          websiteUri: 'https://alphapm.com/',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    if (url.endsWith('/place-2')) {
      return new Response(
        JSON.stringify({
          id: 'place-2',
          displayName: { text: 'Beta Realty' },
          formattedAddress: '2 Main St, Orange Park, FL 32073, USA',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    return new Response('missing', { status: 404 })
  }
}

describe('planClayCountyDiscoveryQueries', () => {
  it('builds one primary query per Clay County hub by default', () => {
    const plans = planClayCountyDiscoveryQueries({
      mode: 'discover',
      wedgeSlug: 'residential_property_management',
      marketRegion: 'Clay County',
    })

    expect(plans).toHaveLength(5)
    expect(plans[0]?.queryText).toBe('Property Management in Orange Park, FL')
    expect(plans[4]?.hubName).toBe('Oakleaf Plantation')
  })
})

describe('Google Places discovery helpers', () => {
  it('adds a fallback query when the primary result set is too small and dedupes place ids', async () => {
    const result = await discoverPlaceSeeds(
      {
        mode: 'discover',
        wedgeSlug: 'residential_property_management',
        marketRegion: 'Clay County',
        hubNames: ['Orange Park'],
        minPrimaryResultsBeforeFallback: 5,
      },
      { apiKey: 'test-key', fetchImpl: buildDiscoveryFetchMock() as unknown as typeof fetch },
    )

    expect(result.plannedQueries).toHaveLength(2)
    expect(result.plannedQueries[1]?.queryKind).toBe('fallback')
    expect(result.placeSeeds.map((seed) => seed.placeId)).toEqual(['place-1', 'place-2'])
  })

  it('resolves websiteUri from Place Details and returns null when absent', async () => {
    const fetchImpl = buildDiscoveryFetchMock() as unknown as typeof fetch
    const withWebsite = await resolvePlaceSeedWebsite(
      {
        provider: 'google_places',
        placeId: 'place-1',
        name: 'Alpha PM',
        formattedAddress: '1 Main St, Orange Park, FL 32073, USA',
        hubName: 'Orange Park',
        queryKind: 'primary',
        queryText: 'Property Management in Orange Park, FL',
      },
      { apiKey: 'test-key', fetchImpl },
    )

    const withoutWebsite = await resolvePlaceSeedWebsite(
      {
        provider: 'google_places',
        placeId: 'place-2',
        name: 'Beta Realty',
        formattedAddress: '2 Main St, Orange Park, FL 32073, USA',
        hubName: 'Orange Park',
        queryKind: 'fallback',
        queryText: 'Real Estate Agency in Orange Park, FL',
      },
      { apiKey: 'test-key', fetchImpl },
    )

    expect(withWebsite?.websiteUri).toBe('https://alphapm.com/')
    expect(withoutWebsite).toBeNull()
  })
})
