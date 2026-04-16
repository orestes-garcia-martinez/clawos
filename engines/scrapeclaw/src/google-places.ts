import {
  SCRAPECLAW_GOOGLE_PLACES_DETAILS_BASE_URL,
  SCRAPECLAW_GOOGLE_PLACES_DETAILS_FIELDS,
  SCRAPECLAW_GOOGLE_PLACES_TEXT_SEARCH_FIELDS,
  SCRAPECLAW_GOOGLE_PLACES_TEXT_SEARCH_URL,
} from './constants.js'
import type {
  GooglePlaceDetails,
  GooglePlacesLocationRestriction,
  GooglePlacesTextSearchResponse,
} from './types.js'

function buildHeaders(apiKey: string, fieldMask: readonly string[]): Record<string, string> {
  return {
    'content-type': 'application/json',
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': fieldMask.join(','),
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Google Places request failed with ${response.status}: ${text.slice(0, 200) || response.statusText}`,
    )
  }
  return (await response.json()) as T
}

export async function textSearchGooglePlaces(
  fetchImpl: typeof fetch,
  params: {
    apiKey: string
    textQuery: string
    pageSize: number
    locationRestriction: GooglePlacesLocationRestriction
    signal?: AbortSignal
  },
): Promise<GooglePlacesTextSearchResponse> {
  const response = await fetchImpl(SCRAPECLAW_GOOGLE_PLACES_TEXT_SEARCH_URL, {
    method: 'POST',
    headers: buildHeaders(params.apiKey, SCRAPECLAW_GOOGLE_PLACES_TEXT_SEARCH_FIELDS),
    signal: params.signal,
    body: JSON.stringify({
      textQuery: params.textQuery,
      pageSize: params.pageSize,
      locationRestriction: params.locationRestriction,
    }),
  })

  return parseJson<GooglePlacesTextSearchResponse>(response)
}

export async function getGooglePlaceDetails(
  fetchImpl: typeof fetch,
  params: { apiKey: string; placeId: string; signal?: AbortSignal },
): Promise<GooglePlaceDetails> {
  const response = await fetchImpl(
    `${SCRAPECLAW_GOOGLE_PLACES_DETAILS_BASE_URL}/${encodeURIComponent(params.placeId)}`,
    {
      method: 'GET',
      headers: buildHeaders(params.apiKey, SCRAPECLAW_GOOGLE_PLACES_DETAILS_FIELDS),
      signal: params.signal,
    },
  )

  return parseJson<GooglePlaceDetails>(response)
}
