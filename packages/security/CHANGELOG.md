# Changelog

## [1.1.0] (2026-04-15)

### Features

- **security:** add ScrapeClawResearchWorkerInputSchema and ScrapeClawResearchRunRequestSchema with HTTPS-only URL refinement ([c2f937c](https://github.com/orestes-garcia-martinez/clawos/commit/c2f937cd6f7c5f4446f27ca87842957612532862))

## [1.0.0] (2026-04-13)

### ⚠ BREAKING CHANGES

- **assertions:** `SkillSlugSchema` now derives from `SKILL_SLUGS` (imported from `@clawos/shared`) rather than a hardcoded `z.enum(['careerclaw'])`. The schema now accepts `'scrapeclaw'`; callers that relied on the enum rejecting unknown slugs should be aware the allowed set can expand when `SKILL_SLUGS` grows.

### Features

- **assertions:** `SkillSlugSchema` is now driven by `SKILL_SLUGS` — no manual sync required when new skills are added to `@clawos/shared`

## [0.5.0] (2026-04-10)

### Features

- **security:** add `SearchOverridesSchema` (`targetIndustry: string`, `targetCompanies: string[]`) and include `searchOverrides` as an optional field in `CareerClawWorkerInputSchema` — validates agent-driven search refinements at the worker boundary before they reach careerclaw-js

## [0.4.0] (2026-04-09)

### Features

- **security:** add `targetIndustry` to `CareerClawProfileSchema` — optional, nullable, max 200 chars; passes through Zod validation alongside existing profile fields so the worker adapter receives the industry string for SerpAPI query narrowing

## [0.3.0] (2026-04-04)

### Features

- **worker-run:** tighten `precomputedGap` schema to structural `GapAnalysisResult` validation ([c0361b1](https://github.com/orestes-garcia-martinez/clawos/commit/c0361b11742454861284fb976aa1fe794d82a09b))

## [0.2.2] (2026-03-31)

### Bug Fixes

- **security:** add `newSession?: boolean` to `ChatRequestSchema` so the web client can signal a fresh conversation start ([585262d](https://github.com/orestes-garcia-martinez/clawos/commit/585262d))

## [0.2.1](https://github.com/orestes-garcia-martinez/clawos/compare/security-v0.2.0...security-v0.2.1) (2026-03-26)


### Bug Fixes

* format lint ([586e671](https://github.com/orestes-garcia-martinez/clawos/commit/586e671c41bcbafc035eac7bee417f2cbcc048b0))
* **security:** break assertion schema circular import ([8f6a8b3](https://github.com/orestes-garcia-martinez/clawos/commit/8f6a8b37936283f58282ef3881e7adda61a2849a))
* **security:** break skill assertion circular dependency ([25ead99](https://github.com/orestes-garcia-martinez/clawos/commit/25ead9902b29acedb26a8263e728c8d2359666c8))

## [0.2.0](https://github.com/orestes-garcia-martinez/clawos/compare/security-v0.1.0...security-v0.2.0) (2026-03-26)


### Features

* **chat-1:** turborepo scaffold + CI/CD ([ed33b90](https://github.com/orestes-garcia-martinez/clawos/commit/ed33b90d1d732d32782dba9defda959fc7681cd7))
* **chat-1:** turborepo scaffold + CI/CD ([b512248](https://github.com/orestes-garcia-martinez/clawos/commit/b512248ed9793c495e5d3992a5b86b2a1aa067a6))
* **chat-3:** lightsail skill worker ([2844172](https://github.com/orestes-garcia-martinez/clawos/commit/2844172749b9d0976d16e68c23dbfb886eacc2ff))
* **chat-4:** fixed worker to match the careerclaw cli ([16ab527](https://github.com/orestes-garcia-martinez/clawos/commit/16ab5274f4019cbd5991f1a4342978f80b4edb7e))
* **chat-5:** telegram adapter implementation ([40b90c0](https://github.com/orestes-garcia-martinez/clawos/commit/40b90c062afd85c88917d658601eb5a3a7a664d8))


### Bug Fixes

* **api:** add postinstall script ([afaea6e](https://github.com/orestes-garcia-martinez/clawos/commit/afaea6e9c1cd88529a734e4cb95ff271b5f1464d))
* **api:** add postinstall script ([89c78fc](https://github.com/orestes-garcia-martinez/clawos/commit/89c78fcfe000586d09bab44bf5265342ccf00a33))
* **api:** point the workspace packages' main and types fields directly to their src/ files so no pre-build step is needed. @vercel/node compiles TypeScript anyway. ([7d93e00](https://github.com/orestes-garcia-martinez/clawos/commit/7d93e0092444713273b8e5420ab60a98c842aaad))
* **vercel:** build internal packages before api deploy and normalize … ([454a79c](https://github.com/orestes-garcia-martinez/clawos/commit/454a79c88206452a5a281f556d0b2b547061c208))
* **vercel:** build internal packages before api deploy and normalize workspace package runtime config ([d768b3d](https://github.com/orestes-garcia-martinez/clawos/commit/d768b3d6927eb9e6705813613e8c9c700fb43d75))
