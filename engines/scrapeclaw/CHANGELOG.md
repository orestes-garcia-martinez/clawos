# Changelog

## [0.2.0] (2026-04-15)

### Features

- **scrapeclaw:** add Google Places API v1 HTTP client (textSearchGooglePlaces, getGooglePlaceDetails) with injectable fetchImpl and per-request AbortSignal timeout ([4411bad](https://github.com/orestes-garcia-martinez/clawos/commit/4411bad57f18a9af02c39ddb737a97b7bceac2fa))
- **scrapeclaw:** add discovery pipeline — planClayCountyDiscoveryQueries, discoverPlaceSeeds (fallback trigger, place-ID dedup), resolvePlaceSeedWebsite ([4411bad](https://github.com/orestes-garcia-martinez/clawos/commit/4411bad57f18a9af02c39ddb737a97b7bceac2fa))
- **scrapeclaw:** add live smoke tests for all Google Places helpers (auto-skipped when API key absent) ([4411bad](https://github.com/orestes-garcia-martinez/clawos/commit/4411bad57f18a9af02c39ddb737a97b7bceac2fa))

### Bug Fixes

- **scrapeclaw:** add per-request fetch timeout via createTimeoutSignal(); truncate error body to 200 chars; strip www. prefix in URL normalisation ([4411bad](https://github.com/orestes-garcia-martinez/clawos/commit/4411bad57f18a9af02c39ddb737a97b7bceac2fa))

## [0.1.0] (2026-04-15)

### Features

- **scrapeclaw:** initial release — deterministic Agent 1 HTML research pipeline with term-matching fit scorer, SSRF guard, and HTML parsing utilities ([c2f937c](https://github.com/orestes-garcia-martinez/clawos/commit/c2f937cd6f7c5f4446f27ca87842957612532862))
