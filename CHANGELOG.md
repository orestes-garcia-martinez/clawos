# Changelog

## [0.7.3](https://github.com/orestes-garcia-martinez/clawos/compare/v0.7.2...v0.7.3) (2026-04-01)


### Bug Fixes

* **api,web,security,shared:** prevent session leak and grounding block in responses ([#128](https://github.com/orestes-garcia-martinez/clawos/issues/128)) ([9b1d258](https://github.com/orestes-garcia-martinez/clawos/commit/9b1d2584ef078f6f56b253123d25a2a643191d6b))

## [0.7.2](https://github.com/orestes-garcia-martinez/clawos/compare/v0.7.1...v0.7.2) (2026-03-31)


### Bug Fixes

* **api:** move grounding context from messages to system prompt ([#126](https://github.com/orestes-garcia-martinez/clawos/issues/126)) ([ac3571d](https://github.com/orestes-garcia-martinez/clawos/commit/ac3571d4559da6786d976da8034649f0a64b09d6))

## [0.7.1](https://github.com/orestes-garcia-martinez/clawos/compare/v0.7.0...v0.7.1) (2026-03-31)


### Bug Fixes

* **api,shared:** prevent grounding block from leaking into user-facing responses ([#124](https://github.com/orestes-garcia-martinez/clawos/issues/124)) ([1f4cfc9](https://github.com/orestes-garcia-martinez/clawos/commit/1f4cfc94fd59958f77a75e4ddb10e055051a869c))

## [0.7.0](https://github.com/orestes-garcia-martinez/clawos/compare/v0.6.0...v0.7.0) (2026-03-31)


### Features

* **api,shared:** extend tool-target enforcer to track_application ([#122](https://github.com/orestes-garcia-martinez/clawos/issues/122)) ([53feb3f](https://github.com/orestes-garcia-martinez/clawos/commit/53feb3f6e90e981f8ccf6e6b23b3ebc50282bfd2))

## [0.6.0](https://github.com/orestes-garcia-martinez/clawos/compare/v0.5.1...v0.6.0) (2026-03-31)


### Features

* **api,shared:** add briefing grounding context injection ([0dd1ef2](https://github.com/orestes-garcia-martinez/clawos/commit/0dd1ef22fbdf466a00f72efb47c9012ae51a9e1d))
* **api,shared:** add server-side intent resolver for briefing follow-up turns ([53792c8](https://github.com/orestes-garcia-martinez/clawos/commit/53792c892170af3ffa0e8f6d008d114419756f5d))
* **api:** add tool-target enforcer and fix mergeSessionState for coverLetterResults ([382c2b9](https://github.com/orestes-garcia-martinez/clawos/commit/382c2b91917438477c32320a0ca8e83ade20e0b2))


### Bug Fixes

* **api,web,worker:** throw on empty LLM responses, bump careerclaw-js to 1.5 ([cc38b07](https://github.com/orestes-garcia-martinez/clawos/commit/cc38b0791ddc7e9071c298d5455f9f198c12ae72))
* **api,web:** throw on empty LLM responses, read resume_intel from briefing ([bd6e110](https://github.com/orestes-garcia-martinez/clawos/commit/bd6e110208d156df9a02913411f5011d699d7048))
* **api:** guard comparison classification behind references.length &gt; 1 ([3cb0c20](https://github.com/orestes-garcia-martinez/clawos/commit/3cb0c208882655fd12fea0ba7b3c0b2d84d54796))
* **api:** persist cover letter result to session state after run_cover_letter ([87d5cf2](https://github.com/orestes-garcia-martinez/clawos/commit/87d5cf2ac5ea251093a09fb6372ca1c4af13e180))
* **api:** restore synthesised resumeIntel fallback for missing briefing field ([1583d7d](https://github.com/orestes-garcia-martinez/clawos/commit/1583d7d900f692e9788eac007867e3ae69b5ef18))
* **api:** use title+company labels for same-company ambiguous matches ([#121](https://github.com/orestes-garcia-martinez/clawos/issues/121)) ([8967a6b](https://github.com/orestes-garcia-martinez/clawos/commit/8967a6bfd56cab0425e82581b5f60c08c80fb0ab))
* **worker:** bump careerclaw-js to ^1.5.0 ([295d39e](https://github.com/orestes-garcia-martinez/clawos/commit/295d39ef2de32ace4d70a0dc5a240cdd1dc7baf4))

## [0.5.1](https://github.com/orestes-garcia-martinez/clawos/compare/v0.5.0...v0.5.1) (2026-03-30)


### Bug Fixes

* **api:** disable SDK retries and bump @anthropic-ai/sdk to 0.80.0 ([c0e562e](https://github.com/orestes-garcia-martinez/clawos/commit/c0e562e48de5f22f03d6c77e96a5ad4b7bdcc279))
* **api:** reorder shouldFailover checks — test APIConnection* before APIError base class ([9c5fe02](https://github.com/orestes-garcia-martinez/clawos/commit/9c5fe02b2ec581f5d7f49a60fa7bbf4eeaefa37d))
* **api:** spread required array to satisfy SDK 0.80.0 mutable string[] constraint ([d2748b4](https://github.com/orestes-garcia-martinez/clawos/commit/d2748b4e6fc366e85609056ec223a4e10db38547))

## [0.5.0](https://github.com/orestes-garcia-martinez/clawos/compare/v0.4.0...v0.5.0) (2026-03-29)


### Features

* **api:** inject active briefing context into Claude messages on each turn ([f1c1c58](https://github.com/orestes-garcia-martinez/clawos/commit/f1c1c5835ab27f0376198e04f97ee6664233ef96))

## [0.4.0](https://github.com/orestes-garcia-martinez/clawos/compare/v0.3.0...v0.4.0) (2026-03-29)


### Features

* **api:** replace in-memory briefing cache with persistent session state ([e13826a](https://github.com/orestes-garcia-martinez/clawos/commit/e13826ab1d715af271fe5e73e406da4a076c2bc9))


### Bug Fixes

* **api:** always clear briefing state on run_careerclaw, even on zero-match runs ([e19b9b5](https://github.com/orestes-garcia-martinez/clawos/commit/e19b9b549f056233aed0b6a2b09bab8c433326d5))

## [0.3.0](https://github.com/orestes-garcia-martinez/clawos/compare/v0.2.0...v0.3.0) (2026-03-29)


### Features

* **api:** add post-briefing advisory tools (gap analysis, cover letter) ([43e7c6b](https://github.com/orestes-garcia-martinez/clawos/commit/43e7c6b6e1666649365fd9dd55c7a6bf7adad07f))
* **worker:** replace CLI bridge with direct careerclaw-js runtime ([465b37d](https://github.com/orestes-garcia-martinez/clawos/commit/465b37d8c4e0eff29b39b7baf33cbaf7f3828928))


### Bug Fixes

* pr reviews ([22bfa2b](https://github.com/orestes-garcia-martinez/clawos/commit/22bfa2bdaed0e42697acae1b19fd41f21f4fd1b7))
* **release:** fix release-please PR title to pass commitlint ([01a329a](https://github.com/orestes-garcia-martinez/clawos/commit/01a329a5f1968005bd3e1747db0e4c3e6838b6c2))
* **security:** patch path-to-regexp ReDoS and make Snyk non-blocking ([3b4ffc2](https://github.com/orestes-garcia-martinez/clawos/commit/3b4ffc2e8ef57f28d60e6e989a00cf9dd37423e6))
