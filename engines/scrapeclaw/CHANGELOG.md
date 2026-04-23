# Changelog

## [0.4.0] (2026-04-22)

### Features

- **scrapeclaw:** add `url-eligibility.ts` — synchronous URL guard normalising http→https, blocking social media / private IPs, and returning a canonical URL for downstream use ([5f30eb4](https://github.com/orestes-garcia-martinez/clawos/commit/5f30eb4f36a5814503f9bbc784fa2088eea85205))
- **scrapeclaw:** add `ranking.ts` — production pre-rank pass scoring name-wedge fit, locality (with hostname normalisation for concatenated city tokens), website quality (landing-slug path penalty), and HOA/community-association exclusion against both name and URL hostname ([5f30eb4](https://github.com/orestes-garcia-martinez/clawos/commit/5f30eb4f36a5814503f9bbc784fa2088eea85205))
- **scrapeclaw:** add `contacts.ts` — email + phone extraction with on-domain priority, role-based mailbox preference, noreply/asset-host rejection, and NANP phone validation ([5f30eb4](https://github.com/orestes-garcia-martinez/clawos/commit/5f30eb4f36a5814503f9bbc784fa2088eea85205))
- **scrapeclaw:** replace monolithic `computeFitScore` with 6-weight decomposed deterministic scoring (wedgeMatch 0.32, inventorySignal 0.18, locality 0.18, websiteQuality 0.12, contactQuality 0.10, evidenceRichness 0.10) ([5f30eb4](https://github.com/orestes-garcia-martinez/clawos/commit/5f30eb4f36a5814503f9bbc784fa2088eea85205))
- **scrapeclaw:** add compromised-page detection — vocabulary match (≥3 suspicious terms with zero wedge signal) and language-agnostic title-divergence check (title ≥40 chars, zero wedge vocab in title or content) ([5f30eb4](https://github.com/orestes-garcia-martinez/clawos/commit/5f30eb4f36a5814503f9bbc784fa2088eea85205))
- **scrapeclaw:** add cross-language gambling vocabulary (`jackpot`, `gambling`, `sportsbook`, `free spins`, `online betting`, `maxwin`, `scatter slot`, `bonus slot`) to suspicious-terms list ([5f30eb4](https://github.com/orestes-garcia-martinez/clawos/commit/5f30eb4f36a5814503f9bbc784fa2088eea85205))
- **scrapeclaw:** surface `scoreBreakdown`, `contactSummary`, and `qualitySummary` in LLM enrichment prompt; add conservative-lean instruction for compromised/thin-evidence cases; replace magic number `0.35` with `SCRAPECLAW_PROSPECT_QUALIFIED_THRESHOLD` ([5f30eb4](https://github.com/orestes-garcia-martinez/clawos/commit/5f30eb4f36a5814503f9bbc784fa2088eea85205))

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
