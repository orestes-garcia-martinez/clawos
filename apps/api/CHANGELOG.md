# Changelog

## [0.7.1] (2026-03-31)

### Bug Fixes

- **api:** fix `buildChoiceLabel` to include title when multiple matches share the same company, preventing infinite clarification loops where "Acme or Acme?" collapsed to an indistinguishable prompt ([577b526](https://github.com/orestes-garcia-martinez/clawos/commit/577b5262df2eef00df0e086be4682847cab4d025))
- **api:** fix `resolveByText` two-pass resolution — prefer `title+company` match over `company`-only so a verbatim clarification reply ("Senior Engineer at Acme") resolves to exactly one match instead of re-triggering the ambiguous loop ([fd85b22](https://github.com/orestes-garcia-martinez/clawos/commit/fd85b22d79520c1291277ad7d7cb5a6cf40d175e))

## [0.7.0] (2026-03-31)

### Features

- **api:** add `tool-target-enforcer.ts` — server-side backstop for `run_gap_analysis` and `run_cover_letter` that validates and corrects `job_id` before each worker call; auto-corrects missing/hallucinated IDs via message reference resolution, clarifies on ambiguous multi-match, and rejects unresolvable references ([662fc8a](https://github.com/orestes-garcia-martinez/clawos/commit/662fc8a5893659c6f5bdf7af6a6c88e2bceb705a))

### Bug Fixes

- **api:** fix `mergeSessionState` to merge `coverLetterResults` additively per `job_id` and clear it on new briefing, preventing stale `cover_letter_cached=yes` flags in the grounding block ([662fc8a](https://github.com/orestes-garcia-martinez/clawos/commit/662fc8a5893659c6f5bdf7af6a6c88e2bceb705a))

## [0.6.0] (2026-03-31)

### Features

- **api:** add `intent-resolver.ts` — classifies user messages into `ResolvedIntentHint` (single_match_analysis, single_match_cover_letter, single_match_tracking, comparison, ambiguous_multi_match) and injects a structured hint block before each Claude call when briefing state is present, reducing ambiguous job_id resolution for follow-up turns ([d0361d7](https://github.com/orestes-garcia-martinez/clawos/commit/d0361d7330e5274ffb0c6fc778085c2080dbb2e2))
- **api:** extend `ordinalToIndex` with bare ordinal variants ("the second one", "the third one" etc.) so natural language references resolve without requiring the word "match" ([d0361d7](https://github.com/orestes-garcia-martinez/clawos/commit/d0361d7330e5274ffb0c6fc778085c2080dbb2e2))
- **api:** export `normalize` from `briefing-grounding.ts` and reuse it in `intent-resolver.ts` ([d0361d7](https://github.com/orestes-garcia-martinez/clawos/commit/d0361d7330e5274ffb0c6fc778085c2080dbb2e2))

## [0.5.1] (2026-03-30)

### Bug Fixes

- **api:** persist cover letter result to session state after `run_cover_letter` so `cover_letter_cached=yes` is correctly emitted in the grounding block on follow-up turns ([87d5cf2](https://github.com/orestes-garcia-martinez/clawos/commit/87d5cf2ac5ea251093a09fb6372ca1c4af13e180))

## [0.5.0] (2026-03-30)

### Features

- **api:** inject authoritative briefing ground-truth block and per-turn referenced-match hint into every Claude call following a briefing run, preventing score hallucination and ambiguous job_id resolution ([8ca3072](https://github.com/orestes-garcia-martinez/clawos/commit/8ca307260cdffa3026b36484fc9a0f932d3c0a97))

## [0.4.2] (2026-03-30)

### Bug Fixes

- **api:** throw on empty Anthropic text responses instead of silently returning an empty string; add `extractTextOrThrow()` in `llm.ts` and `requireNonEmptyAssistantMessage()` in `chat.ts` to surface `LLM_ERROR` when any LLM call returns blank content ([74f733e](https://github.com/orestes-garcia-martinez/clawos/commit/74f733e72f8ded3cfdb54087db32777873f52e76))
- **api:** read `resumeIntel` directly from `briefing.resume_intel` (careerclaw-js 1.5) instead of synthesising it from `profileRow.skills` ([74f733e](https://github.com/orestes-garcia-martinez/clawos/commit/74f733e72f8ded3cfdb54087db32777873f52e76))

## [0.4.1] (2026-03-29)

### Bug Fixes

- **api:** disable SDK-level retries (`maxRetries: 0`) on both Anthropic and OpenAI clients so timeout errors surface immediately to failover logic instead of being silently retried up to 2×, which would multiply effective wait time to 135s ([fc8ec3d](https://github.com/orestes-garcia-martinez/clawos/commit/fc8ec3d435c7933e4681e5bb4dc70dfe26312696))
- **deps:** bump `@anthropic-ai/sdk` from 0.39.0 to 0.80.0 ([fc8ec3d](https://github.com/orestes-garcia-martinez/clawos/commit/fc8ec3d435c7933e4681e5bb4dc70dfe26312696))

## [0.4.0] (2026-03-29)

### Features

- **api:** inject active briefing match index as ephemeral context before each Claude call, ensuring job_id resolution survives message pruning ([78d5f42](https://github.com/orestes-garcia-martinez/clawos/commit/78d5f42))

### Bug Fixes

- **api:** restore zero-match briefing clear — always replace session briefing state on every run_careerclaw call to prevent stale job_ids surviving a no-match run ([78d5f42](https://github.com/orestes-garcia-martinez/clawos/commit/78d5f42))

## [0.3.0] (2026-03-29)

### Features

- **api:** replace in-memory briefing cache with persistent session state JSONB column; briefing matches, gap results, and profile snapshot now survive cold starts and multi-instance deploys ([d396740](https://github.com/orestes-garcia-martinez/clawos/commit/d396740921b9942a710a3d40fbd20cf4b75ed86d))
- **api:** store full formatted assistant responses in session messages instead of truncated summaries ([d396740](https://github.com/orestes-garcia-martinez/clawos/commit/d396740921b9942a710a3d40fbd20cf4b75ed86d))
- **api:** add `mergeSessionState`, `getMatchFromState`, `getGapResultFromState` helpers with unit test coverage ([d396740](https://github.com/orestes-garcia-martinez/clawos/commit/d396740921b9942a710a3d40fbd20cf4b75ed86d))

## [0.2.0](https://github.com/orestes-garcia-martinez/clawos/compare/api-v0.1.0...api-v0.2.0) (2026-03-26)


### Features

* add list action to app tracking ([1b352bf](https://github.com/orestes-garcia-martinez/clawos/commit/1b352bfb4ce63aaee19ec3fbdd2a2e5d2837d9c9))
* **app:** clawos web app ([07a699a](https://github.com/orestes-garcia-martinez/clawos/commit/07a699ac3179075c2000e67c2e5464818a8a25be))
* **chat-1:** turborepo scaffold + CI/CD ([b512248](https://github.com/orestes-garcia-martinez/clawos/commit/b512248ed9793c495e5d3992a5b86b2a1aa067a6))
* **chat-4:** agent api implementation ([8faf803](https://github.com/orestes-garcia-martinez/clawos/commit/8faf8035a8d7fc9bd0d9878522262762960d04cc))
* **chat-4:** fixed linter ([c6cf648](https://github.com/orestes-garcia-martinez/clawos/commit/c6cf64836ef4bf0f4aafd214c1ca2f6372e3e2c6))
* **chat-4:** move vercel.json into apps/api/ folder ([d46d1a7](https://github.com/orestes-garcia-martinez/clawos/commit/d46d1a7967e8d5fb17005b6062cc084e7de4bb21))
* **chat-4:** update vercel config ([390ee3b](https://github.com/orestes-garcia-martinez/clawos/commit/390ee3b62189d7197996162ce3419d522aa48bf6))
* **chat-5:** telegram adapter implementation ([27b4fea](https://github.com/orestes-garcia-martinez/clawos/commit/27b4fea6bf5daf59da164c381316b9f6465691c4))
* **chat-7-8:** billing integration — Polar.sh checkout, webhooks, entitlements. E2E tests, security review, MVP launch runbook ([da70516](https://github.com/orestes-garcia-martinez/clawos/commit/da70516cd9c73d68b7ad6132cf8cb5744caa5bb8))
* **Lightsail:** prepare scalation ([51e85c7](https://github.com/orestes-garcia-martinez/clawos/commit/51e85c7f7cb008a295040709e1c471a5fe8f81bf))
* llm job application tracking tool ([130b3f1](https://github.com/orestes-garcia-martinez/clawos/commit/130b3f1a4fe1159ddfc1151f4e66ad028df3328b))


### Bug Fixes

* [@codex](https://github.com/codex) pr review comments ([631fefc](https://github.com/orestes-garcia-martinez/clawos/commit/631fefcc716df9c2b14c1a5a0024b694ab02f912))
* **api:** add a vercel build to root package.json ([fbcea97](https://github.com/orestes-garcia-martinez/clawos/commit/fbcea976d3eae9df29d19ca798dd9ef0876bb33e))
* **api:** guard serve() for Vercel, add service auth headers to CORS ([2b34969](https://github.com/orestes-garcia-martinez/clawos/commit/2b349690b7f7a2a7e86744810eedd32c605895bc))
* **api:** remove builds from vercel.json, use handle(app) for Vercel Node.js runtime ([c3bdfb3](https://github.com/orestes-garcia-martinez/clawos/commit/c3bdfb333bc0f2d43794b47986609d848ebfe099))
* **api:** upsert session on missing sessionId + seed profile in integration tests ([dbc8848](https://github.com/orestes-garcia-martinez/clawos/commit/dbc8848078e6464d481ee46b2cc2b02aa71d858b))
* **app:** pr comments ([8bb06ed](https://github.com/orestes-garcia-martinez/clawos/commit/8bb06ed390e93bb8651907320c1ae04cd69a4219))
* cross-turn job id lost ([22b442b](https://github.com/orestes-garcia-martinez/clawos/commit/22b442b26211977dea6b68607b0790fe1ac53605))
* **dependency:** update package json ([47a0a87](https://github.com/orestes-garcia-martinez/clawos/commit/47a0a870c097121d4fbbf281465d44c0139ff980))
* last pr comments ([bf7d725](https://github.com/orestes-garcia-martinez/clawos/commit/bf7d72533a95b4a205583d875d06d9c60eb69d69))
* linter ([e7e738e](https://github.com/orestes-garcia-martinez/clawos/commit/e7e738e51fa77b9dad8b36e20372661932eaca67))
* linter and remove claude pr review action ([7df2f55](https://github.com/orestes-garcia-martinez/clawos/commit/7df2f55ec6243d545ad3e9b357f8b834ebda6598))
* **linter:** fixed linter ([6001824](https://github.com/orestes-garcia-martinez/clawos/commit/600182488af2ad81a256767c2ec5191e9a61c4a4))
* **patch:** webhook fallback fix for externalId and customer email support ([0245b53](https://github.com/orestes-garcia-martinez/clawos/commit/0245b53b6004f8917fc3b51c796ded599b1fe272))
* pr review comments ([e74d133](https://github.com/orestes-garcia-martinez/clawos/commit/e74d1335e8feebc3d2549b5f5ec689e26b927eeb))
* preserve existing status when saving upserts duplicates ([bb82790](https://github.com/orestes-garcia-martinez/clawos/commit/bb82790ad078d8c05b22710d30dd7c479226f26d))
* require save-update fields in track_application schema ([dc5b6c4](https://github.com/orestes-garcia-martinez/clawos/commit/dc5b6c4eb1df636fce786bfdf1de306492a429eb))
* **test:** billing test ([d3fd2a5](https://github.com/orestes-garcia-martinez/clawos/commit/d3fd2a5b0b06d67bb7e843507fe0dc85a2585dc0))
* update chat api logic ([ab4086d](https://github.com/orestes-garcia-martinez/clawos/commit/ab4086deff76487312268d25fb23913148203b0e))
* update polar portal handler to use customer id ([7c835fd](https://github.com/orestes-garcia-martinez/clawos/commit/7c835fd9b76464d769804dc6399d75b9bbc3196e))
* **vercel:** add .js extension to index import for node16 moduleResolution ([851ba21](https://github.com/orestes-garcia-martinez/clawos/commit/851ba2160dbff7ec6edf307446cc155c1a4889c9))
* **vercel:** add buildCommand to compile api package before deploy ([fa94f61](https://github.com/orestes-garcia-martinez/clawos/commit/fa94f614f84a79e271550164c3fd350aaba2126d))
* **vercel:** build internal packages before api deploy and normalize … ([454a79c](https://github.com/orestes-garcia-martinez/clawos/commit/454a79c88206452a5a281f556d0b2b547061c208))
* **vercel:** force turbo rebuild and include api/ in build inputs ([710a6ce](https://github.com/orestes-garcia-martinez/clawos/commit/710a6ce837b1712d6ee40a3bcff57f80ae5c482c))
* **vercel:** import from dist not src in serverless entry point ([ae6bc0d](https://github.com/orestes-garcia-martinez/clawos/commit/ae6bc0d0126f0ce9e061f3e27fdde433338f5254))
* **vercel:** scope api project to apps/api root ([d5b84cf](https://github.com/orestes-garcia-martinez/clawos/commit/d5b84cf4923d0c609f02df133758a412cf12328f))
* **vercel:** set outputDirectory and drop edge runtime ([e99408f](https://github.com/orestes-garcia-martinez/clawos/commit/e99408ff9b79908d1936ead32f40165b2266a2a4))
* **vercel:** use js serverless entrypoint importing compiled dist app ([677d076](https://github.com/orestes-garcia-martinez/clawos/commit/677d0760b8e9fb5d5da77ca8cf4634e14791e4bd))
* **web:** re-hydrate chat thread on reload, hide location helper text (BUG-009, BUG-010) ([cbe3bd2](https://github.com/orestes-garcia-martinez/clawos/commit/cbe3bd2bc734a62d3dd65c91d1ef2addc963025d))
