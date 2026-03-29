# Changelog

## [0.3.0] (2026-03-29)

### Features

- **shared:** add `SessionState` interface and `state` field to `Session` type following Google ADK session state pattern ([d396740](https://github.com/orestes-garcia-martinez/clawos/commit/d396740921b9942a710a3d40fbd20cf4b75ed86d))
- **shared:** update `CAREERCLAW_SYSTEM_PROMPT` — add `<tier_signals>` section, explicit reasoning scaffold, behavioral `<profile_context>`, accuracy rule in `<tool_result_handling>`, `track_application` example, and positive-framing tool rules ([d396740](https://github.com/orestes-garcia-martinez/clawos/commit/d396740921b9942a710a3d40fbd20cf4b75ed86d))

## [0.2.0](https://github.com/orestes-garcia-martinez/clawos/compare/shared-v0.1.0...shared-v0.2.0) (2026-03-26)


### Features

* add list action to app tracking ([1b352bf](https://github.com/orestes-garcia-martinez/clawos/commit/1b352bfb4ce63aaee19ec3fbdd2a2e5d2837d9c9))
* add list action to app tracking ([a2a72f5](https://github.com/orestes-garcia-martinez/clawos/commit/a2a72f5822e2fb3e3f592bd676c24cc8e1ecc5ff))
* **chat-1:** turborepo scaffold + CI/CD ([ed33b90](https://github.com/orestes-garcia-martinez/clawos/commit/ed33b90d1d732d32782dba9defda959fc7681cd7))
* **chat-1:** turborepo scaffold + CI/CD ([b512248](https://github.com/orestes-garcia-martinez/clawos/commit/b512248ed9793c495e5d3992a5b86b2a1aa067a6))
* **chat-3:** lightsail skill worker ([2844172](https://github.com/orestes-garcia-martinez/clawos/commit/2844172749b9d0976d16e68c23dbfb886eacc2ff))
* **chat-4:** agent api implementation ([8faf803](https://github.com/orestes-garcia-martinez/clawos/commit/8faf8035a8d7fc9bd0d9878522262762960d04cc))
* **chat-4:** agent api implementation ([f617870](https://github.com/orestes-garcia-martinez/clawos/commit/f61787021b851b21dd07b6edc1e258ded17a5124))
* **chat-4:** fixed linter ([c6cf648](https://github.com/orestes-garcia-martinez/clawos/commit/c6cf64836ef4bf0f4aafd214c1ca2f6372e3e2c6))
* **chat-4:** update vercel config ([390ee3b](https://github.com/orestes-garcia-martinez/clawos/commit/390ee3b62189d7197996162ce3419d522aa48bf6))
* **chat-5:** telegram adapter implementation ([40b90c0](https://github.com/orestes-garcia-martinez/clawos/commit/40b90c062afd85c88917d658601eb5a3a7a664d8))
* **chat-7-8:** billing integration — Polar.sh checkout, webhooks, en… ([b175673](https://github.com/orestes-garcia-martinez/clawos/commit/b175673f83b08ddaaa5893b3353f59e23ebd5482))
* **chat-7-8:** billing integration — Polar.sh checkout, webhooks, entitlements. E2E tests, security review, MVP launch runbook ([da70516](https://github.com/orestes-garcia-martinez/clawos/commit/da70516cd9c73d68b7ad6132cf8cb5744caa5bb8))
* llm job application tracking tool ([0ca0b95](https://github.com/orestes-garcia-martinez/clawos/commit/0ca0b95f0d981649cb87e2bd13ad6419f5f61e79))
* **web:** implement manual job application tracking ([cfaca62](https://github.com/orestes-garcia-martinez/clawos/commit/cfaca62d9213912fcbb2aa1b7deb92c038822fca))
* **web:** implement manual job application tracking ([499e243](https://github.com/orestes-garcia-martinez/clawos/commit/499e243517ad47e79095d198f6a0fdbb06f26672))
* **web:** web app modernization phase 1 ([d9622e3](https://github.com/orestes-garcia-martinez/clawos/commit/d9622e32b377d960ffc9561b448365f8f7304624))


### Bug Fixes

* **api:** add postinstall script ([89c78fc](https://github.com/orestes-garcia-martinez/clawos/commit/89c78fcfe000586d09bab44bf5265342ccf00a33))
* **api:** point the workspace packages' main and types fields directly to their src/ files so no pre-build step is needed. @vercel/node compiles TypeScript anyway. ([7d93e00](https://github.com/orestes-garcia-martinez/clawos/commit/7d93e0092444713273b8e5420ab60a98c842aaad))
* linter ([a67992d](https://github.com/orestes-garcia-martinez/clawos/commit/a67992d5fd52a66fca02b52c51654c7a5763582d))
* linter ([d0019ec](https://github.com/orestes-garcia-martinez/clawos/commit/d0019ecd792b78a4ae6d92fae163c346a5e2b1b5))
* **vercel:** build internal packages before api deploy and normalize … ([454a79c](https://github.com/orestes-garcia-martinez/clawos/commit/454a79c88206452a5a281f556d0b2b547061c208))
* **vercel:** build internal packages before api deploy and normalize workspace package runtime config ([d768b3d](https://github.com/orestes-garcia-martinez/clawos/commit/d768b3d6927eb9e6705813613e8c9c700fb43d75))
