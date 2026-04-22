# Changelog

## [0.3.0] (2026-04-17)

### Features

- **scrapeclaw:** add `llm-enrichment.ts` — LLM enrichment layer over the deterministic research engine using Claude Haiku structured tool calling (`emit_prospect_judgment`), per-prospect try/catch fallback, 25 s `AbortController` timeout, `max_tokens` raised to 1 500 ([14f8f52](https://github.com/orestes-garcia-martinez/clawos/commit/14f8f52ba429a44beaf7ef0d6cb99d14e54bbcf3))
- **scrapeclaw:** add `llm-enrichment.test.ts` — 4 unit tests covering success path, HTTP-500 fallback, `maxProspects` cap, and Zod schema-validation fallback ([14f8f52](https://github.com/orestes-garcia-martinez/clawos/commit/14f8f52ba429a44beaf7ef0d6cb99d14e54bbcf3))
- **scrapeclaw:** add `llm-enrichment.smoke.test.ts` — 2 smoke tests: plumbing / discovery-order pipeline and quality-ordered pipeline with cheap pre-rank by wedge-term signal before spending research budget ([14f8f52](https://github.com/orestes-garcia-martinez/clawos/commit/14f8f52ba429a44beaf7ef0d6cb99d14e54bbcf3))
- **scrapeclaw:** add `SCRAPECLAW_DEFAULT_LLM_CALL_TIMEOUT_MS = 25_000` and `SCRAPECLAW_DEFAULT_ENRICHMENT_MODEL`; export `runScrapeClawAgent1Enrichment` from `index.ts` ([14f8f52](https://github.com/orestes-garcia-martinez/clawos/commit/14f8f52ba429a44beaf7ef0d6cb99d14e54bbcf3))

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
