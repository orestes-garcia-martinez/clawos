# Changelog

## [0.5.1](https://github.com/orestes-garcia-martinez/clawos/compare/v0.5.0...v0.5.1) (2026-03-30)


### Bug Fixes

* **api:** disable SDK retries and bump @anthropic-ai/sdk to 0.80.0 ([c0e562e](https://github.com/orestes-garcia-martinez/clawos/commit/c0e562e48de5f22f03d6c77e96a5ad4b7bdcc279))
* **api:** disable SDK retries and bump @anthropic-ai/sdk to 0.80.0 ([6ba8d62](https://github.com/orestes-garcia-martinez/clawos/commit/6ba8d62a11fae8dc7412c6acd56af0d7e4023301))
* **api:** reorder shouldFailover checks — test APIConnection* before APIError base class ([9c5fe02](https://github.com/orestes-garcia-martinez/clawos/commit/9c5fe02b2ec581f5d7f49a60fa7bbf4eeaefa37d))
* **api:** spread required array to satisfy SDK 0.80.0 mutable string[] constraint ([d2748b4](https://github.com/orestes-garcia-martinez/clawos/commit/d2748b4e6fc366e85609056ec223a4e10db38547))

## [0.5.0](https://github.com/orestes-garcia-martinez/clawos/compare/v0.4.0...v0.5.0) (2026-03-29)


### Features

* **api:** inject active briefing context into Claude messages on each turn ([f1c1c58](https://github.com/orestes-garcia-martinez/clawos/commit/f1c1c5835ab27f0376198e04f97ee6664233ef96))
* **api:** inject active briefing context into Claude messages on each turn ([78d5f42](https://github.com/orestes-garcia-martinez/clawos/commit/78d5f422615471db3ae1bdebd5a7395a93814844))

## [0.4.0](https://github.com/orestes-garcia-martinez/clawos/compare/v0.3.0...v0.4.0) (2026-03-29)


### Features

* **api:** replace in-memory briefing cache with persistent session state ([e13826a](https://github.com/orestes-garcia-martinez/clawos/commit/e13826ab1d715af271fe5e73e406da4a076c2bc9))
* **api:** replace in-memory briefing cache with persistent session state ([9a55458](https://github.com/orestes-garcia-martinez/clawos/commit/9a55458bffe3400c432a28f7ef55b37ca8a38f2e))


### Bug Fixes

* **api:** always clear briefing state on run_careerclaw, even on zero-match runs ([e19b9b5](https://github.com/orestes-garcia-martinez/clawos/commit/e19b9b549f056233aed0b6a2b09bab8c433326d5))

## [0.3.0](https://github.com/orestes-garcia-martinez/clawos/compare/v0.2.0...v0.3.0) (2026-03-29)


### Features

* **api:** add post-briefing advisory tools (gap analysis, cover letter) ([43e7c6b](https://github.com/orestes-garcia-martinez/clawos/commit/43e7c6b6e1666649365fd9dd55c7a6bf7adad07f))
* **api:** add post-briefing advisory tools (gap analysis, cover letter) ([b61acf0](https://github.com/orestes-garcia-martinez/clawos/commit/b61acf07c57f91b8e83da1e063d0e85ec0513bc7))
* **worker:** replace CLI bridge with direct careerclaw-js runtime ([465b37d](https://github.com/orestes-garcia-martinez/clawos/commit/465b37d8c4e0eff29b39b7baf33cbaf7f3828928))
* **worker:** replace CLI bridge with direct careerclaw-js runtime ([062956c](https://github.com/orestes-garcia-martinez/clawos/commit/062956c3723db398fa2efbeeaf8d535742d1428a))


### Bug Fixes

* pr reviews ([22bfa2b](https://github.com/orestes-garcia-martinez/clawos/commit/22bfa2bdaed0e42697acae1b19fd41f21f4fd1b7))
* **release:** fix release-please PR title to pass commitlint ([01a329a](https://github.com/orestes-garcia-martinez/clawos/commit/01a329a5f1968005bd3e1747db0e4c3e6838b6c2))
* **release:** fix release-please PR title to pass commitlint ([7e6db06](https://github.com/orestes-garcia-martinez/clawos/commit/7e6db06c94b57158941328208c18400fceddc9bb))
* **security:** patch path-to-regexp ReDoS and make Snyk non-blocking ([3b4ffc2](https://github.com/orestes-garcia-martinez/clawos/commit/3b4ffc2e8ef57f28d60e6e989a00cf9dd37423e6))
