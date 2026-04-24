# Changelog

## [0.14.0] (2026-04-24)

### Features

- **worker:** add ScrapeClaw Phase 5 demo package generation — `executePackage()` orchestrates prospect/business/evidence load, insight engine invocation, artifact assembly, Supabase persistence, and prospect status flip; idempotency guard rejects re-packaging; error recovery marks failed rows; E2E smoke test covers full pipeline with real Google Places + Anthropic APIs and guaranteed zero-row Supabase cleanup ([70a5d47](https://github.com/orestes-garcia-martinez/clawos/commit/70a5d4776af62d180932bfc8880fa500892a0db7))

## [0.13.0] (2026-04-18)

### Features

- **worker:** wire ScrapeClaw Agent 1 LLM enrichment into adapter dispatch — `executeEnrichment()` delegates to `runScrapeClawAgent1Enrichment`; add `getScrapeClawAnthropicApiKey` / `getScrapeClawEnrichmentModel` helpers; document `SCRAPECLAW_ANTHROPIC_API_KEY` and `SCRAPECLAW_ENRICHMENT_MODEL` in `.env.example` ([14f8f52](https://github.com/orestes-garcia-martinez/clawos/commit/14f8f52ba429a44beaf7ef0d6cb99d14e54bbcf3))

### Bug Fixes

- **deps:** bump `careerclaw-js` `^1.14.0` → `^1.14.1` — resolves 5 critical `protobufjs < 7.5.5` vulnerabilities (GHSA-xq3m-2v4x-88gg) transitively via `@xenova/transformers` upgrade in 1.14.1 ([1592ea4](https://github.com/orestes-garcia-martinez/clawos/commit/1592ea4))

## [0.12.0] (2026-04-15)

### Features

- **worker:** add ScrapeClaw discovery pipeline via Google Places API — hub query planning, fallback trigger, place-ID dedup, website resolution, and Supabase persistence via ScrapeClawDiscoveryStore ([4411bad](https://github.com/orestes-garcia-martinez/clawos/commit/4411bad57f18a9af02c39ddb737a97b7bceac2fa))
- **worker:** extract Express app factory to app.ts (bootstrap-only index.ts); add skills/careerclaw/router.ts for gap-analysis and cover-letter sub-routes; delete dead cli-adapter.ts and cli-bridge.ts ([4411bad](https://github.com/orestes-garcia-martinez/clawos/commit/4411bad57f18a9af02c39ddb737a97b7bceac2fa))

## [0.11.0] (2026-04-15)

### Features

- **worker:** add ScrapeClaw Agent 1 research skill — deterministic HTML scraping pipeline with fit scoring, SSRF guard, and typed skill registry map ([c2f937c](https://github.com/orestes-garcia-martinez/clawos/commit/c2f937cd6f7c5f4446f27ca87842957612532862))

## [0.10.2] (2026-04-13)

### Bug Fixes

- **worker:** `isSkillSlug` now uses `SKILL_SLUGS.includes()` instead of `value === 'careerclaw'` so new skills are accepted without a code change
- **worker:** move adapter existence check before skill-specific request parsing — recognised-but-unimplemented slugs (e.g. `scrapeclaw`) now return 404 instead of a misleading 400
- **registry:** type `skillRegistry` as `Partial<Record<SkillSlug, …>>` to allow valid slugs that don't yet have a worker adapter

## [0.10.1] (2026-04-13)

### Bug Fixes

- **worker:** raise and validate the skill execution timeout, and strip `careerclaw.llm_outreach_draft` from synchronous briefing execution so Pro briefings stop timing out in the hot path ([fbcd95f](https://github.com/orestes-garcia-martinez/clawos/commit/fbcd95fd7a487c6545593a26b9d9a5b76cfbced0))

## [0.10.0] (2026-04-10)

### Features

- **worker:** bump `careerclaw-js` `^1.12.0` → `^1.13.0` to consume improved briefing precision across retrieval, deduplication, and role-fit scoring
- **worker:** refresh lockfile to resolve published `careerclaw-js@1.13.0`

## [0.9.0] (2026-04-10)

### Features

- **worker:** forward `searchOverrides` from `CareerClawWorkerInput` to `runCareerClawWithContext` with camelCase→snake_case mapping (`targetIndustry` → `target_industry`, `targetCompanies` → `target_companies`) — completes the agent-driven search override pipe from API to careerclaw-js engine

## [0.8.0] (2026-04-09)

### Features

- **worker:** map `targetIndustry` from `CareerClawWorkerProfile` to `UserProfile.target_industry` in `buildCareerClawProfile` — allows the worker to pass the user's industry/sector (e.g. "B2B SaaS") to the careerclaw-js briefing engine for domain-aware SerpAPI queries
- **deps:** bump careerclaw-js `^1.11.1` → `^1.12.0` — consumes `SearchOverrides`, `target_industry` SerpAPI query injection, `minKeywordScore` tightening (0.01→0.03), and hybrid `scoreWorkMode` differentiation

## [0.7.0] (2026-04-07)

### Features

- **worker:** call `warmEmbeddingProvider()` at startup — pre-loads the ONNX embedding model into memory before the first request arrives; safe no-op when `CAREERCLAW_EMBEDDING_PROVIDER=none`
- **deps:** bump careerclaw-js `^1.10.1` → `^1.11.0` — consumes optional local embedding provider (semantic scoring via `Xenova/all-MiniLM-L6-v2`)

## [0.6.1] (2026-04-07)

### Bug Fixes

- **deps:** bump careerclaw-js to 1.10.1 — fixes phantom project-management concept injection from resume narrative text, removes `"product"` from stopwords, and adds the Design/UX taxonomy domain so design profiles produce non-zero semantic concept scores ([9e5ed76](https://github.com/orestes-garcia-martinez/clawos/commit/9e5ed7642886d3f1b7decf0952cf4937ef6a3482))

## [0.6.0] (2026-04-06)

### Features

- **worker:** convert `locationRadiusMi` → km in `buildCareerClawProfile` (`Math.round(mi * 1.60934)`); passes `location_radius_km` to careerclaw-js engine which applies the operator hard cap

## [0.5.1] (2026-04-04)

### Bug Fixes

- **worker:** read version from package.json in /health; add timestamp field ([9e0633c](https://github.com/orestes-garcia-martinez/clawos/commit/9e0633cce61701deebd1a1c825318189ed51fe8e))

## [0.5.0] (2026-04-04)

### Features

- **careerclaw:** make gap analysis adapter async and enable timeout on the route ([c0361b1](https://github.com/orestes-garcia-martinez/clawos/commit/c0361b11742454861284fb976aa1fe794d82a09b))

## [0.4.1] (2026-04-02)

### Bug Fixes

- **worker:** load `.env` via `--env-file` on startup so `CAREERCLAW_ANTHROPIC_KEY` and `CAREERCLAW_OPENAI_KEY` reach careerclaw-js config at module init time, unblocking LLM cover letter generation ([4d4a93d](https://github.com/orestes-garcia-martinez/clawos/commit/4d4a93d9e65335050e7717d9d9bd73d4102a6378))

## [0.4.0] (2026-04-02)

### Features

- **worker:** bump careerclaw-js `^1.5.0` → `^1.6.1` — consumes template quality guard (gap keyword filtering, `_meta` observability field, structured LLM chain logging) ([dc64fc8](https://github.com/orestes-garcia-martinez/clawos/commit/dc64fc87bd9b21704868d4acb7890fc137b652fb))

## [0.3.1] (2026-03-30)

### Bug Fixes

- **worker:** bump `careerclaw-js` from `^1.4.0` to `^1.5.0` ([295d39e](https://github.com/orestes-garcia-martinez/clawos/commit/295d39ef2de32ace4d70a0dc5a240cdd1dc7baf4))

## [0.3.0](https://github.com/orestes-garcia-martinez/clawos/compare/worker-v0.2.0...worker-v0.3.0) (2026-03-27)


### Features

* **worker:** replace CLI bridge with direct careerclaw-js runtime ([465b37d](https://github.com/orestes-garcia-martinez/clawos/commit/465b37d8c4e0eff29b39b7baf33cbaf7f3828928))
* **worker:** replace CLI bridge with direct careerclaw-js runtime ([062956c](https://github.com/orestes-garcia-martinez/clawos/commit/062956c3723db398fa2efbeeaf8d535742d1428a))

## [0.2.0](https://github.com/orestes-garcia-martinez/clawos/compare/worker-v0.1.0...worker-v0.2.0) (2026-03-26)


### Features

* **chat-1:** turborepo scaffold + CI/CD ([ed33b90](https://github.com/orestes-garcia-martinez/clawos/commit/ed33b90d1d732d32782dba9defda959fc7681cd7))
* **chat-1:** turborepo scaffold + CI/CD ([b512248](https://github.com/orestes-garcia-martinez/clawos/commit/b512248ed9793c495e5d3992a5b86b2a1aa067a6))
* **chat-3:** lightsail skill worker ([2844172](https://github.com/orestes-garcia-martinez/clawos/commit/2844172749b9d0976d16e68c23dbfb886eacc2ff))
* **chat-3:** update package versions and add vitest coverage to worker app ([d156de7](https://github.com/orestes-garcia-martinez/clawos/commit/d156de7e491046c6e144110bea0c0db3283c29d1))
* **chat-4:** fixed careerclaw bin resolution path ([750b06a](https://github.com/orestes-garcia-martinez/clawos/commit/750b06adce2a596383a36544e02a7ad944a6ac50))
* **chat-4:** fixed careerclaw bin resolution path ([181ff63](https://github.com/orestes-garcia-martinez/clawos/commit/181ff633f57cf9b927e9453b803d569d25f4d113))
* **chat-4:** fixed worker to match the careerclaw cli ([16ab527](https://github.com/orestes-garcia-martinez/clawos/commit/16ab5274f4019cbd5991f1a4342978f80b4edb7e))


### Bug Fixes

* upgrade careerclaw-js ([66d3297](https://github.com/orestes-garcia-martinez/clawos/commit/66d3297b1f6a5ada6cb68dfd72f9da13cb522b3a))
