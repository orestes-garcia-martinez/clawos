# Changelog

## [0.13.1](https://github.com/orestes-garcia-martinez/clawos/compare/v0.13.0...v0.13.1) (2026-04-05)


### Bug Fixes

* **api,telegram,worker:** read version from package.json in /health ([#158](https://github.com/orestes-garcia-martinez/clawos/issues/158)) ([f995ae1](https://github.com/orestes-garcia-martinez/clawos/commit/f995ae1ce3a42248435d219a318da4d78bbe8233))

## [0.13.0](https://github.com/orestes-garcia-martinez/clawos/compare/v0.12.0...v0.13.0) (2026-04-04)


### Features

* **worker:** make gap analysis async and register llm_gap_analysis entitlement ([#155](https://github.com/orestes-garcia-martinez/clawos/issues/155)) ([00d8972](https://github.com/orestes-garcia-martinez/clawos/commit/00d89727f22162885c8eae5953e40920df5c6049))

## [0.12.0](https://github.com/orestes-garcia-martinez/clawos/compare/v0.11.0...v0.12.0) (2026-04-04)


### Features

* **web:** sidebar v2 popover nav and magic-link-only auth ([#153](https://github.com/orestes-garcia-martinez/clawos/issues/153)) ([dfa6a17](https://github.com/orestes-garcia-martinez/clawos/commit/dfa6a17a566749d05b0193aa1eff862ad2e29457))

## [0.11.0](https://github.com/orestes-garcia-martinez/clawos/compare/v0.10.0...v0.11.0) (2026-04-04)


### Features

* add claude for reviews ([57d3c75](https://github.com/orestes-garcia-martinez/clawos/commit/57d3c75194a52e7ff666fd87a4d2eecd8328c07f))
* add list action to app tracking ([1b352bf](https://github.com/orestes-garcia-martinez/clawos/commit/1b352bfb4ce63aaee19ec3fbdd2a2e5d2837d9c9))
* add list action to app tracking ([a2a72f5](https://github.com/orestes-garcia-martinez/clawos/commit/a2a72f5822e2fb3e3f592bd676c24cc8e1ecc5ff))
* add release please configuration with commitlint ([879b7ec](https://github.com/orestes-garcia-martinez/clawos/commit/879b7ec083ab6c8f9c1ae1c529335337c3233ebd))
* add release please configuration with commitlint ([43456aa](https://github.com/orestes-garcia-martinez/clawos/commit/43456aad8416d83b14e69a9a84383bc58f5c9615))
* **api,shared:** add briefing grounding context injection ([0dd1ef2](https://github.com/orestes-garcia-martinez/clawos/commit/0dd1ef22fbdf466a00f72efb47c9012ae51a9e1d))
* **api,shared:** add briefing grounding context injection ([8179ed6](https://github.com/orestes-garcia-martinez/clawos/commit/8179ed60071fc18ab623cacefddf7b9211d392c3))
* **api,shared:** add server-side intent resolver for briefing follow-up turns ([53792c8](https://github.com/orestes-garcia-martinez/clawos/commit/53792c892170af3ffa0e8f6d008d114419756f5d))
* **api,shared:** add server-side intent resolver for briefing follow-up turns ([d0361d7](https://github.com/orestes-garcia-martinez/clawos/commit/d0361d7330e5274ffb0c6fc778085c2080dbb2e2))
* **api,shared:** extend tool-target enforcer to track_application ([#122](https://github.com/orestes-garcia-martinez/clawos/issues/122)) ([53feb3f](https://github.com/orestes-garcia-martinez/clawos/commit/53feb3f6e90e981f8ccf6e6b23b3ebc50282bfd2))
* **api,shared:** replace regex intent detection with LLM-declared also_execute ([#143](https://github.com/orestes-garcia-martinez/clawos/issues/143)) ([c0ea080](https://github.com/orestes-garcia-martinez/clawos/commit/c0ea080cba3ea82d46a327c5ed099cfd1907fed9))
* **api,worker:** template quality guard and LLM chain observability (P1b) ([#136](https://github.com/orestes-garcia-martinez/clawos/issues/136)) ([b064bb3](https://github.com/orestes-garcia-martinez/clawos/commit/b064bb39d46737ef868481b3c54d21322c2a7b87))
* **api:** add forensic logger for LLM observability ([#132](https://github.com/orestes-garcia-martinez/clawos/issues/132)) ([755f586](https://github.com/orestes-garcia-martinez/clawos/commit/755f586dac9d0c86dedf327af148fceafd8a453b))
* **api:** add P0 hallucination sanitizer and pending-action auto-save ([#134](https://github.com/orestes-garcia-martinez/clawos/issues/134)) ([526d80c](https://github.com/orestes-garcia-martinez/clawos/commit/526d80c940f9f423eeaf53318be98c3decd5ca4f))
* **api:** add pending-action queue and gap score fix (P2) ([#141](https://github.com/orestes-garcia-martinez/clawos/issues/141)) ([0a6874e](https://github.com/orestes-garcia-martinez/clawos/commit/0a6874ef494d5fa3c641f3b1d799b95d4337c534))
* **api:** add post-briefing advisory tools (gap analysis, cover letter) ([43e7c6b](https://github.com/orestes-garcia-martinez/clawos/commit/43e7c6b6e1666649365fd9dd55c7a6bf7adad07f))
* **api:** add post-briefing advisory tools (gap analysis, cover letter) ([b61acf0](https://github.com/orestes-garcia-martinez/clawos/commit/b61acf07c57f91b8e83da1e063d0e85ec0513bc7))
* **api:** add queue observability and LLM format calls for pending sections ([#142](https://github.com/orestes-garcia-martinez/clawos/issues/142)) ([49d03cf](https://github.com/orestes-garcia-martinez/clawos/commit/49d03cf39c3d2034b9ad44b117c1f80c5fc4bfae))
* **api:** add tool-target enforcer and fix mergeSessionState for coverLetterResults ([382c2b9](https://github.com/orestes-garcia-martinez/clawos/commit/382c2b91917438477c32320a0ca8e83ade20e0b2))
* **api:** add tool-target enforcer and fix mergeSessionState for coverLetterResults ([662fc8a](https://github.com/orestes-garcia-martinez/clawos/commit/662fc8a5893659c6f5bdf7af6a6c88e2bceb705a))
* **api:** inject active briefing context into Claude messages on each turn ([f1c1c58](https://github.com/orestes-garcia-martinez/clawos/commit/f1c1c5835ab27f0376198e04f97ee6664233ef96))
* **api:** inject active briefing context into Claude messages on each turn ([78d5f42](https://github.com/orestes-garcia-martinez/clawos/commit/78d5f422615471db3ae1bdebd5a7395a93814844))
* **api:** openAI tool failover, credit-error failover, P1b track enforcer ([fe91778](https://github.com/orestes-garcia-martinez/clawos/commit/fe917782da870da673d45dab921b97a5a4bb94c6))
* **api:** openAI tool failover, credit-error failover, P1b tracker update enforcer ([#146](https://github.com/orestes-garcia-martinez/clawos/issues/146)) ([fe91778](https://github.com/orestes-garcia-martinez/clawos/commit/fe917782da870da673d45dab921b97a5a4bb94c6))
* **api:** prevent cover letter worker bypass on rewrite requests (P1a) ([#135](https://github.com/orestes-garcia-martinez/clawos/issues/135)) ([beb6b77](https://github.com/orestes-garcia-martinez/clawos/commit/beb6b77fc74089fb10d7d8599eefbf8481f3a3f3))
* **api:** replace in-memory briefing cache with persistent session state ([e13826a](https://github.com/orestes-garcia-martinez/clawos/commit/e13826ab1d715af271fe5e73e406da4a076c2bc9))
* **api:** replace in-memory briefing cache with persistent session state ([9a55458](https://github.com/orestes-garcia-martinez/clawos/commit/9a55458bffe3400c432a28f7ef55b37ca8a38f2e))
* **app:** clawos web app ([07a699a](https://github.com/orestes-garcia-martinez/clawos/commit/07a699ac3179075c2000e67c2e5464818a8a25be))
* **app:** clawos web app ([a1b8afc](https://github.com/orestes-garcia-martinez/clawos/commit/a1b8afc0dad93a98955f65471ce18fb367845ca8))
* **chat-1:** turborepo scaffold + CI/CD ([ed33b90](https://github.com/orestes-garcia-martinez/clawos/commit/ed33b90d1d732d32782dba9defda959fc7681cd7))
* **chat-1:** turborepo scaffold + CI/CD ([5dfc1d5](https://github.com/orestes-garcia-martinez/clawos/commit/5dfc1d5e533f6640e5af18ce988c8fb6c6107851))
* **chat-1:** turborepo scaffold + CI/CD ([b512248](https://github.com/orestes-garcia-martinez/clawos/commit/b512248ed9793c495e5d3992a5b86b2a1aa067a6))
* **chat-3:** lightsail skill worker ([2844172](https://github.com/orestes-garcia-martinez/clawos/commit/2844172749b9d0976d16e68c23dbfb886eacc2ff))
* **chat-3:** update Lightsail package ([6ef7c69](https://github.com/orestes-garcia-martinez/clawos/commit/6ef7c69655ef571f31865a07b8d818878e1e4263))
* **chat-3:** update Lightsail package ([65d8cf1](https://github.com/orestes-garcia-martinez/clawos/commit/65d8cf154661bf86b12337bc3c8dc874b3a43a69))
* **chat-3:** update package versions and add vitest coverage to worker app ([d156de7](https://github.com/orestes-garcia-martinez/clawos/commit/d156de7e491046c6e144110bea0c0db3283c29d1))
* **chat-4:** add project docs ([24442b2](https://github.com/orestes-garcia-martinez/clawos/commit/24442b2eff116e29e71df3b485d5fdccb39a2a1c))
* **chat-4:** add project docs ([cc5a16f](https://github.com/orestes-garcia-martinez/clawos/commit/cc5a16f468978272e85f30ccae87e14fd556118e))
* **chat-4:** add worker smoke test curl for reference ([7767c48](https://github.com/orestes-garcia-martinez/clawos/commit/7767c48ebf4826199f52a7e99081150a2395aae5))
* **chat-4:** agent api implementation ([8faf803](https://github.com/orestes-garcia-martinez/clawos/commit/8faf8035a8d7fc9bd0d9878522262762960d04cc))
* **chat-4:** agent api implementation ([7899578](https://github.com/orestes-garcia-martinez/clawos/commit/7899578e80aa06f3b995154f93cca7025a03ca63))
* **chat-4:** agent api implementation ([f617870](https://github.com/orestes-garcia-martinez/clawos/commit/f61787021b851b21dd07b6edc1e258ded17a5124))
* **chat-4:** fixed careerclaw bin resolution path ([750b06a](https://github.com/orestes-garcia-martinez/clawos/commit/750b06adce2a596383a36544e02a7ad944a6ac50))
* **chat-4:** fixed careerclaw bin resolution path ([181ff63](https://github.com/orestes-garcia-martinez/clawos/commit/181ff633f57cf9b927e9453b803d569d25f4d113))
* **chat-4:** fixed directory typo ([e5b113f](https://github.com/orestes-garcia-martinez/clawos/commit/e5b113f54b073fa5eca7dec2830e38ca851c6dc8))
* **chat-4:** fixed directory typo ([6d7ffc0](https://github.com/orestes-garcia-martinez/clawos/commit/6d7ffc05b403a62d0b6fb3755c68338fa02ffd72))
* **chat-4:** fixed linter ([c6cf648](https://github.com/orestes-garcia-martinez/clawos/commit/c6cf64836ef4bf0f4aafd214c1ca2f6372e3e2c6))
* **chat-4:** fixed worker to match the careerclaw cli ([16ab527](https://github.com/orestes-garcia-martinez/clawos/commit/16ab5274f4019cbd5991f1a4342978f80b4edb7e))
* **chat-4:** move vercel.json into apps/api/ folder ([d46d1a7](https://github.com/orestes-garcia-martinez/clawos/commit/d46d1a7967e8d5fb17005b6062cc084e7de4bb21))
* **chat-4:** update vercel config ([390ee3b](https://github.com/orestes-garcia-martinez/clawos/commit/390ee3b62189d7197996162ce3419d522aa48bf6))
* **chat-4:** update vercel config ([c6215fb](https://github.com/orestes-garcia-martinez/clawos/commit/c6215fb89bf1c40a25ddeeea748af4e6616a8dc8))
* **chat-5:** fixed linter ([fcec7b4](https://github.com/orestes-garcia-martinez/clawos/commit/fcec7b41e37c23e75741b197a2877343bd30fba9))
* **chat-5:** telegram adapter implementation ([27b4fea](https://github.com/orestes-garcia-martinez/clawos/commit/27b4fea6bf5daf59da164c381316b9f6465691c4))
* **chat-5:** telegram adapter implementation ([40b90c0](https://github.com/orestes-garcia-martinez/clawos/commit/40b90c062afd85c88917d658601eb5a3a7a664d8))
* **chat-7-8:** billing integration — Polar.sh checkout, webhooks, en… ([b175673](https://github.com/orestes-garcia-martinez/clawos/commit/b175673f83b08ddaaa5893b3353f59e23ebd5482))
* **chat-7-8:** billing integration — Polar.sh checkout, webhooks, entitlements. E2E tests, security review, MVP launch runbook ([da70516](https://github.com/orestes-garcia-martinez/clawos/commit/da70516cd9c73d68b7ad6132cf8cb5744caa5bb8))
* **Lightsail:** prepare scalation ([51e85c7](https://github.com/orestes-garcia-martinez/clawos/commit/51e85c7f7cb008a295040709e1c471a5fe8f81bf))
* **Lightsail:** preparing Lightsail scalation ([f1a8e22](https://github.com/orestes-garcia-martinez/clawos/commit/f1a8e222f6c55a0251cf4a4106a38894dacecea0))
* llm job application tracking tool ([130b3f1](https://github.com/orestes-garcia-martinez/clawos/commit/130b3f1a4fe1159ddfc1151f4e66ad028df3328b))
* llm job application tracking tool ([0ca0b95](https://github.com/orestes-garcia-martinez/clawos/commit/0ca0b95f0d981649cb87e2bd13ad6419f5f61e79))
* llm job application tracking tool ([f52c502](https://github.com/orestes-garcia-martinez/clawos/commit/f52c502ce0dadcf177081f9a9ecd4ab65ec6788c))
* new account & careerclaw setting ui experience ([f00caaa](https://github.com/orestes-garcia-martinez/clawos/commit/f00caaa5f301cb4f5c0395d7aea77faf4a4ac45b))
* platform skills signed assertion ([928748e](https://github.com/orestes-garcia-martinez/clawos/commit/928748e38bfb34a8bff26e54121d5081e9abe5ae))
* platform skills signed assertion ([872d4f2](https://github.com/orestes-garcia-martinez/clawos/commit/872d4f214bf841898661c36d85d3a22bf9d02b44))
* web app polar billing ([b907ccd](https://github.com/orestes-garcia-martinez/clawos/commit/b907ccd5b097c61130b81b96c8dd6b37e94f530b))
* web app polar billing ([12b2524](https://github.com/orestes-garcia-martinez/clawos/commit/12b2524d0ba48ccdcd697c93e729866416e85e25))
* web improvement phase 3 ([6cbc8af](https://github.com/orestes-garcia-martinez/clawos/commit/6cbc8afe3dec4d98b25425b79d8ad91d0bf8c0bd))
* **web:** add favicon set and dynamic skill version via prebuild ([#150](https://github.com/orestes-garcia-martinez/clawos/issues/150)) ([887ce38](https://github.com/orestes-garcia-martinez/clawos/commit/887ce38b26be43ebf25beda44a14166a090e24a4))
* **web:** implement manual job application tracking ([cfaca62](https://github.com/orestes-garcia-martinez/clawos/commit/cfaca62d9213912fcbb2aa1b7deb92c038822fca))
* **web:** implement manual job application tracking ([499e243](https://github.com/orestes-garcia-martinez/clawos/commit/499e243517ad47e79095d198f6a0fdbb06f26672))
* **web:** web app modernization phase 1 ([d9622e3](https://github.com/orestes-garcia-martinez/clawos/commit/d9622e32b377d960ffc9561b448365f8f7304624))
* **web:** web experience improvements phase 2 ([8a4611a](https://github.com/orestes-garcia-martinez/clawos/commit/8a4611a272730dbba0d66be4f75def3cd4dd5859))
* **worker:** replace CLI bridge with direct careerclaw-js runtime ([465b37d](https://github.com/orestes-garcia-martinez/clawos/commit/465b37d8c4e0eff29b39b7baf33cbaf7f3828928))
* **worker:** replace CLI bridge with direct careerclaw-js runtime ([062956c](https://github.com/orestes-garcia-martinez/clawos/commit/062956c3723db398fa2efbeeaf8d535742d1428a))
* **worker:** wire execution context through gap analysis and cover letter adapters ([#140](https://github.com/orestes-garcia-martinez/clawos/issues/140)) ([65f8c5e](https://github.com/orestes-garcia-martinez/clawos/commit/65f8c5e49498d813e377608d7c97589b7687688c))


### Bug Fixes

* [@codex](https://github.com/codex) pr review comments ([631fefc](https://github.com/orestes-garcia-martinez/clawos/commit/631fefcc716df9c2b14c1a5a0024b694ab02f912))
* **api,shared:** fix duplicate cover letter and empty title in tracker save ([#145](https://github.com/orestes-garcia-martinez/clawos/issues/145)) ([e9e4135](https://github.com/orestes-garcia-martinez/clawos/commit/e9e413518d0c3b3531e9563f1d1b3da2c79342e9))
* **api,shared:** prevent grounding block from leaking into user-facing responses ([#124](https://github.com/orestes-garcia-martinez/clawos/issues/124)) ([1f4cfc9](https://github.com/orestes-garcia-martinez/clawos/commit/1f4cfc94fd59958f77a75e4ddb10e055051a869c))
* **api,web,security,shared:** prevent session leak and grounding block in responses ([#128](https://github.com/orestes-garcia-martinez/clawos/issues/128)) ([9b1d258](https://github.com/orestes-garcia-martinez/clawos/commit/9b1d2584ef078f6f56b253123d25a2a643191d6b))
* **api,web,worker:** throw on empty LLM responses, bump careerclaw-js to 1.5 ([cc38b07](https://github.com/orestes-garcia-martinez/clawos/commit/cc38b0791ddc7e9071c298d5455f9f198c12ae72))
* **api,web:** throw on empty LLM responses, read resume_intel from briefing ([bd6e110](https://github.com/orestes-garcia-martinez/clawos/commit/bd6e110208d156df9a02913411f5011d699d7048))
* **api,worker:** fix cover letter retry 403 and unblock LLM env loading ([#138](https://github.com/orestes-garcia-martinez/clawos/issues/138)) ([5e76509](https://github.com/orestes-garcia-martinez/clawos/commit/5e765096782410e5069d9ec2c7d350cd684bb85f))
* **api:** add a vercel build to root package.json ([fbcea97](https://github.com/orestes-garcia-martinez/clawos/commit/fbcea976d3eae9df29d19ca798dd9ef0876bb33e))
* **api:** add postinstall script ([afaea6e](https://github.com/orestes-garcia-martinez/clawos/commit/afaea6e9c1cd88529a734e4cb95ff271b5f1464d))
* **api:** add postinstall script ([89c78fc](https://github.com/orestes-garcia-martinez/clawos/commit/89c78fcfe000586d09bab44bf5265342ccf00a33))
* **api:** always clear briefing state on run_careerclaw, even on zero-match runs ([e19b9b5](https://github.com/orestes-garcia-martinez/clawos/commit/e19b9b549f056233aed0b6a2b09bab8c433326d5))
* **api:** carry also_execute into effectiveToolInput for 7c/7d/7e format calls ([#144](https://github.com/orestes-garcia-martinez/clawos/issues/144)) ([7e59485](https://github.com/orestes-garcia-martinez/clawos/commit/7e59485c6a040688f7d16c0ce340d572bc5d8a74))
* **api:** disable SDK retries and bump @anthropic-ai/sdk to 0.80.0 ([c0e562e](https://github.com/orestes-garcia-martinez/clawos/commit/c0e562e48de5f22f03d6c77e96a5ad4b7bdcc279))
* **api:** disable SDK retries and bump @anthropic-ai/sdk to 0.80.0 ([6ba8d62](https://github.com/orestes-garcia-martinez/clawos/commit/6ba8d62a11fae8dc7412c6acd56af0d7e4023301))
* **api:** drop P0-stripped residual from P1b tracker confirmation ([#147](https://github.com/orestes-garcia-martinez/clawos/issues/147)) ([d3a8a01](https://github.com/orestes-garcia-martinez/clawos/commit/d3a8a01c8aed754ede96c4d5d671fd05c65fca87))
* **api:** extend duplicate-save detection to 7e direct track_application path ([#149](https://github.com/orestes-garcia-martinez/clawos/issues/149)) ([5801699](https://github.com/orestes-garcia-martinez/clawos/commit/58016995832460c73146d2c51d092ddc6bfb69e4))
* **api:** guard comparison classification behind references.length &gt; 1 ([3cb0c20](https://github.com/orestes-garcia-martinez/clawos/commit/3cb0c208882655fd12fea0ba7b3c0b2d84d54796))
* **api:** guard serve() for Vercel, add service auth headers to CORS ([2b34969](https://github.com/orestes-garcia-martinez/clawos/commit/2b349690b7f7a2a7e86744810eedd32c605895bc))
* **api:** guard serve() for Vercel, add service auth headers to CORS ([70d1450](https://github.com/orestes-garcia-martinez/clawos/commit/70d145070b35539026cda3da9f3ceb18aaef097c))
* **api:** handle unique constraint in saveSession upsert ([#130](https://github.com/orestes-garcia-martinez/clawos/issues/130)) ([d134978](https://github.com/orestes-garcia-martinez/clawos/commit/d13497829ceef607e2d61d0986bb59063e79ea15))
* **api:** move grounding context from messages to system prompt ([#126](https://github.com/orestes-garcia-martinez/clawos/issues/126)) ([ac3571d](https://github.com/orestes-garcia-martinez/clawos/commit/ac3571d4559da6786d976da8034649f0a64b09d6))
* **api:** persist cover letter result to session state after run_cover_letter ([87d5cf2](https://github.com/orestes-garcia-martinez/clawos/commit/87d5cf2ac5ea251093a09fb6372ca1c4af13e180))
* **api:** point the workspace packages' main and types fields directly to their src/ files so no pre-build step is needed. @vercel/node compiles TypeScript anyway. ([7d93e00](https://github.com/orestes-garcia-martinez/clawos/commit/7d93e0092444713273b8e5420ab60a98c842aaad))
* **api:** remove builds from vercel.json, use handle(app) for Vercel Node.js runtime ([c3bdfb3](https://github.com/orestes-garcia-martinez/clawos/commit/c3bdfb333bc0f2d43794b47986609d848ebfe099))
* **api:** reorder shouldFailover checks — test APIConnection* before APIError base class ([9c5fe02](https://github.com/orestes-garcia-martinez/clawos/commit/9c5fe02b2ec581f5d7f49a60fa7bbf4eeaefa37d))
* **api:** restore synthesised resumeIntel fallback for missing briefing field ([1583d7d](https://github.com/orestes-garcia-martinez/clawos/commit/1583d7d900f692e9788eac007867e3ae69b5ef18))
* **api:** spread required array to satisfy SDK 0.80.0 mutable string[] constraint ([d2748b4](https://github.com/orestes-garcia-martinez/clawos/commit/d2748b4e6fc366e85609056ec223a4e10db38547))
* **api:** suppress corrective note in format paths and detect duplicate track saves ([#148](https://github.com/orestes-garcia-martinez/clawos/issues/148)) ([a728371](https://github.com/orestes-garcia-martinez/clawos/commit/a72837132c3c927a040082d679a49a75a892e292))
* **api:** upsert session on missing sessionId + seed profile in integration tests ([dbc8848](https://github.com/orestes-garcia-martinez/clawos/commit/dbc8848078e6464d481ee46b2cc2b02aa71d858b))
* **api:** use title+company labels for same-company ambiguous matches ([#121](https://github.com/orestes-garcia-martinez/clawos/issues/121)) ([8967a6b](https://github.com/orestes-garcia-martinez/clawos/commit/8967a6bfd56cab0425e82581b5f60c08c80fb0ab))
* apply Prettier formatting to fix CI format:check failure ([7aa2e39](https://github.com/orestes-garcia-martinez/clawos/commit/7aa2e395e6721dd36d139e81d54a5cb325699e8b))
* **app:** pr comments ([8bb06ed](https://github.com/orestes-garcia-martinez/clawos/commit/8bb06ed390e93bb8651907320c1ae04cd69a4219))
* chat history lost ([c1997f7](https://github.com/orestes-garcia-martinez/clawos/commit/c1997f7ce1e8932b5a3b4e9426836b38047f9835))
* cross-turn job id lost ([22b442b](https://github.com/orestes-garcia-martinez/clawos/commit/22b442b26211977dea6b68607b0790fe1ac53605))
* cross-turn job id lost ([4260ee1](https://github.com/orestes-garcia-martinez/clawos/commit/4260ee13f5bb4cca2d69912011f692ea1a244e42))
* **dependency:** update package json ([47a0a87](https://github.com/orestes-garcia-martinez/clawos/commit/47a0a870c097121d4fbbf281465d44c0139ff980))
* fix UX after manual test findings ([735b516](https://github.com/orestes-garcia-martinez/clawos/commit/735b51681f83ae82a595dec4457935b627ff78e1))
* format lint ([586e671](https://github.com/orestes-garcia-martinez/clawos/commit/586e671c41bcbafc035eac7bee417f2cbcc048b0))
* last pr comments ([bf7d725](https://github.com/orestes-garcia-martinez/clawos/commit/bf7d72533a95b4a205583d875d06d9c60eb69d69))
* linter ([e7e738e](https://github.com/orestes-garcia-martinez/clawos/commit/e7e738e51fa77b9dad8b36e20372661932eaca67))
* linter ([f3a954f](https://github.com/orestes-garcia-martinez/clawos/commit/f3a954f221c57cdbc58ac8c34604c2f7219b7a12))
* linter ([a67992d](https://github.com/orestes-garcia-martinez/clawos/commit/a67992d5fd52a66fca02b52c51654c7a5763582d))
* linter ([d0019ec](https://github.com/orestes-garcia-martinez/clawos/commit/d0019ecd792b78a4ae6d92fae163c346a5e2b1b5))
* linter ([284b06c](https://github.com/orestes-garcia-martinez/clawos/commit/284b06cb0e3582d47a5313ad7a1d372b56a2b83f))
* linter ([e8c4475](https://github.com/orestes-garcia-martinez/clawos/commit/e8c4475e3640a4d8c70181c3bcb66724b4aaa4fc))
* linter and remove claude pr review action ([7df2f55](https://github.com/orestes-garcia-martinez/clawos/commit/7df2f55ec6243d545ad3e9b357f8b834ebda6598))
* **linter:** fixed linter ([6001824](https://github.com/orestes-garcia-martinez/clawos/commit/600182488af2ad81a256767c2ec5191e9a61c4a4))
* **patch:** webhook fallback fix for externalId and customer email su… ([66345ba](https://github.com/orestes-garcia-martinez/clawos/commit/66345ba362caa23df9ffa148cc849639d65599fa))
* **patch:** webhook fallback fix for externalId and customer email support ([0245b53](https://github.com/orestes-garcia-martinez/clawos/commit/0245b53b6004f8917fc3b51c796ded599b1fe272))
* pr comments ([bc32879](https://github.com/orestes-garcia-martinez/clawos/commit/bc328790b7107fda4b1a30a84d14c6c12fa06b2e))
* pr review comments ([e74d133](https://github.com/orestes-garcia-martinez/clawos/commit/e74d1335e8feebc3d2549b5f5ec689e26b927eeb))
* pr reviews ([22bfa2b](https://github.com/orestes-garcia-martinez/clawos/commit/22bfa2bdaed0e42697acae1b19fd41f21f4fd1b7))
* preserve existing status when saving upserts duplicates ([bb82790](https://github.com/orestes-garcia-martinez/clawos/commit/bb82790ad078d8c05b22710d30dd7c479226f26d))
* prettier format ([7f8f098](https://github.com/orestes-garcia-martinez/clawos/commit/7f8f0983b7122aba72c314a4b777813352c3e00e))
* **pr:** pr comments ([4214b96](https://github.com/orestes-garcia-martinez/clawos/commit/4214b961d8625b1c6abe34c01577022e7b4598c2))
* **release:** fix release-please PR title to pass commitlint ([01a329a](https://github.com/orestes-garcia-martinez/clawos/commit/01a329a5f1968005bd3e1747db0e4c3e6838b6c2))
* **release:** fix release-please PR title to pass commitlint ([7e6db06](https://github.com/orestes-garcia-martinez/clawos/commit/7e6db06c94b57158941328208c18400fceddc9bb))
* require save-update fields in track_application schema ([dc5b6c4](https://github.com/orestes-garcia-martinez/clawos/commit/dc5b6c4eb1df636fce786bfdf1de306492a429eb))
* review comments ([f657f54](https://github.com/orestes-garcia-martinez/clawos/commit/f657f5457d20088b97cb0cc4e6bf6dd72dcf06af))
* **security:** break assertion schema circular import ([8f6a8b3](https://github.com/orestes-garcia-martinez/clawos/commit/8f6a8b37936283f58282ef3881e7adda61a2849a))
* **security:** break skill assertion circular dependency ([25ead99](https://github.com/orestes-garcia-martinez/clawos/commit/25ead9902b29acedb26a8263e728c8d2359666c8))
* **security:** patch path-to-regexp ReDoS and make Snyk non-blocking ([3b4ffc2](https://github.com/orestes-garcia-martinez/clawos/commit/3b4ffc2e8ef57f28d60e6e989a00cf9dd37423e6))
* **test:** billing test ([d3fd2a5](https://github.com/orestes-garcia-martinez/clawos/commit/d3fd2a5b0b06d67bb7e843507fe0dc85a2585dc0))
* update chat api logic ([ab4086d](https://github.com/orestes-garcia-martinez/clawos/commit/ab4086deff76487312268d25fb23913148203b0e))
* update claude review yml ([bb36335](https://github.com/orestes-garcia-martinez/clawos/commit/bb3633560f052f26b591fdaace05bbcd91f5e948))
* update polar portal handler to use customer id ([7c835fd](https://github.com/orestes-garcia-martinez/clawos/commit/7c835fd9b76464d769804dc6399d75b9bbc3196e))
* update polar portal handler to use customer id ([42a4b61](https://github.com/orestes-garcia-martinez/clawos/commit/42a4b612b763fcbadd9d36abdbbcda46d76d5f27))
* upgrade careerclaw-js ([66d3297](https://github.com/orestes-garcia-martinez/clawos/commit/66d3297b1f6a5ada6cb68dfd72f9da13cb522b3a))
* use only trackUpdateMessage as the final response when P1b succeeds. ([d3a8a01](https://github.com/orestes-garcia-martinez/clawos/commit/d3a8a01c8aed754ede96c4d5d671fd05c65fca87))
* **vercel:** add .js extension to index import for node16 moduleResolution ([851ba21](https://github.com/orestes-garcia-martinez/clawos/commit/851ba2160dbff7ec6edf307446cc155c1a4889c9))
* **vercel:** add buildCommand to compile api package before deploy ([fa94f61](https://github.com/orestes-garcia-martinez/clawos/commit/fa94f614f84a79e271550164c3fd350aaba2126d))
* **vercel:** add buildCommand to compile api package before deploy ([c6d21a0](https://github.com/orestes-garcia-martinez/clawos/commit/c6d21a06c5082eee6292364c344cd955ea90264a))
* **vercel:** build internal packages before api deploy and normalize … ([454a79c](https://github.com/orestes-garcia-martinez/clawos/commit/454a79c88206452a5a281f556d0b2b547061c208))
* **vercel:** build internal packages before api deploy and normalize workspace package runtime config ([d768b3d](https://github.com/orestes-garcia-martinez/clawos/commit/d768b3d6927eb9e6705813613e8c9c700fb43d75))
* **vercel:** clear output directory and use config as source of truth ([128d4dd](https://github.com/orestes-garcia-martinez/clawos/commit/128d4ddeca95c142f5e1218b9665160a3f9455f7))
* **vercel:** force turbo rebuild and include api/ in build inputs ([710a6ce](https://github.com/orestes-garcia-martinez/clawos/commit/710a6ce837b1712d6ee40a3bcff57f80ae5c482c))
* **vercel:** force turbo rebuild and include api/ in build inputs ([35d2cde](https://github.com/orestes-garcia-martinez/clawos/commit/35d2cdebbd7817dc8e58df4ffc920d4e6f3c0d44))
* **vercel:** import from dist not src in serverless entry point ([ae6bc0d](https://github.com/orestes-garcia-martinez/clawos/commit/ae6bc0d0126f0ce9e061f3e27fdde433338f5254))
* **vercel:** import from dist not src in serverless entry point ([144f37a](https://github.com/orestes-garcia-martinez/clawos/commit/144f37a755d49497762ae0e709b55a790deb3537))
* **vercel:** remove build command and deploy as functions-first api ([8b95d70](https://github.com/orestes-garcia-martinez/clawos/commit/8b95d701941ef35faee6a24f8cc801e52dd5516c))
* **vercel:** scope api project to apps/api root ([d5b84cf](https://github.com/orestes-garcia-martinez/clawos/commit/d5b84cf4923d0c609f02df133758a412cf12328f))
* **vercel:** set outputDirectory and drop edge runtime ([e99408f](https://github.com/orestes-garcia-martinez/clawos/commit/e99408ff9b79908d1936ead32f40165b2266a2a4))
* **vercel:** use js serverless entrypoint importing compiled dist app ([677d076](https://github.com/orestes-garcia-martinez/clawos/commit/677d0760b8e9fb5d5da77ca8cf4634e14791e4bd))
* **vercel:** use root api function entry for deployment ([0873ce6](https://github.com/orestes-garcia-martinez/clawos/commit/0873ce6e8dfce4feea64228198c015f46cfd6966))
* web api matches api endpoints for billing ([0f90d0e](https://github.com/orestes-garcia-martinez/clawos/commit/0f90d0eb425caabf4451e8ba5b309d234a97513c))
* **web:** BUG-006 CareerClaw profile setup flow (work_mode + salary_min) ([c17a95c](https://github.com/orestes-garcia-martinez/clawos/commit/c17a95c19a48c44aca622f8c9ff952278ea920e7))
* **web:** re-hydrate chat thread on reload, hide location helper text (BUG-009, BUG-010) ([cbe3bd2](https://github.com/orestes-garcia-martinez/clawos/commit/cbe3bd2bc734a62d3dd65c91d1ef2addc963025d))
* **web:** re-hydrate chat thread on reload, hide location helper text… ([6bde7b0](https://github.com/orestes-garcia-martinez/clawos/commit/6bde7b0e51f0cf45832139bbfcb8d120993f7d33))
* **worker:** bump careerclaw-js to ^1.5.0 ([295d39e](https://github.com/orestes-garcia-martinez/clawos/commit/295d39ef2de32ace4d70a0dc5a240cdd1dc7baf4))

## [0.10.0](https://github.com/orestes-garcia-martinez/clawos/compare/v0.9.0...v0.10.0) (2026-04-04)


### Features

* **web:** add favicon set and dynamic skill version via prebuild ([#150](https://github.com/orestes-garcia-martinez/clawos/issues/150)) ([887ce38](https://github.com/orestes-garcia-martinez/clawos/commit/887ce38b26be43ebf25beda44a14166a090e24a4))

## [0.9.0](https://github.com/orestes-garcia-martinez/clawos/compare/v0.8.0...v0.9.0) (2026-04-04)


### Features

* **api,shared:** replace regex intent detection with LLM-declared also_execute ([#143](https://github.com/orestes-garcia-martinez/clawos/issues/143)) ([c0ea080](https://github.com/orestes-garcia-martinez/clawos/commit/c0ea080cba3ea82d46a327c5ed099cfd1907fed9))
* **api:** add pending-action queue and gap score fix (P2) ([#141](https://github.com/orestes-garcia-martinez/clawos/issues/141)) ([0a6874e](https://github.com/orestes-garcia-martinez/clawos/commit/0a6874ef494d5fa3c641f3b1d799b95d4337c534))
* **api:** add queue observability and LLM format calls for pending sections ([#142](https://github.com/orestes-garcia-martinez/clawos/issues/142)) ([49d03cf](https://github.com/orestes-garcia-martinez/clawos/commit/49d03cf39c3d2034b9ad44b117c1f80c5fc4bfae))
* **api:** openAI tool failover, credit-error failover, P1b track enforcer ([fe91778](https://github.com/orestes-garcia-martinez/clawos/commit/fe917782da870da673d45dab921b97a5a4bb94c6))
* **api:** openAI tool failover, credit-error failover, P1b tracker update enforcer ([#146](https://github.com/orestes-garcia-martinez/clawos/issues/146)) ([fe91778](https://github.com/orestes-garcia-martinez/clawos/commit/fe917782da870da673d45dab921b97a5a4bb94c6))
* **worker:** wire execution context through gap analysis and cover letter adapters ([#140](https://github.com/orestes-garcia-martinez/clawos/issues/140)) ([65f8c5e](https://github.com/orestes-garcia-martinez/clawos/commit/65f8c5e49498d813e377608d7c97589b7687688c))


### Bug Fixes

* **api,shared:** fix duplicate cover letter and empty title in tracker save ([#145](https://github.com/orestes-garcia-martinez/clawos/issues/145)) ([e9e4135](https://github.com/orestes-garcia-martinez/clawos/commit/e9e413518d0c3b3531e9563f1d1b3da2c79342e9))
* **api,worker:** fix cover letter retry 403 and unblock LLM env loading ([#138](https://github.com/orestes-garcia-martinez/clawos/issues/138)) ([5e76509](https://github.com/orestes-garcia-martinez/clawos/commit/5e765096782410e5069d9ec2c7d350cd684bb85f))
* **api:** carry also_execute into effectiveToolInput for 7c/7d/7e format calls ([#144](https://github.com/orestes-garcia-martinez/clawos/issues/144)) ([7e59485](https://github.com/orestes-garcia-martinez/clawos/commit/7e59485c6a040688f7d16c0ce340d572bc5d8a74))
* **api:** drop P0-stripped residual from P1b tracker confirmation ([#147](https://github.com/orestes-garcia-martinez/clawos/issues/147)) ([d3a8a01](https://github.com/orestes-garcia-martinez/clawos/commit/d3a8a01c8aed754ede96c4d5d671fd05c65fca87))
* **api:** extend duplicate-save detection to 7e direct track_application path ([#149](https://github.com/orestes-garcia-martinez/clawos/issues/149)) ([5801699](https://github.com/orestes-garcia-martinez/clawos/commit/58016995832460c73146d2c51d092ddc6bfb69e4))
* **api:** suppress corrective note in format paths and detect duplicate track saves ([#148](https://github.com/orestes-garcia-martinez/clawos/issues/148)) ([a728371](https://github.com/orestes-garcia-martinez/clawos/commit/a72837132c3c927a040082d679a49a75a892e292))
* use only trackUpdateMessage as the final response when P1b succeeds. ([d3a8a01](https://github.com/orestes-garcia-martinez/clawos/commit/d3a8a01c8aed754ede96c4d5d671fd05c65fca87))

## [0.8.0](https://github.com/orestes-garcia-martinez/clawos/compare/v0.7.4...v0.8.0) (2026-04-02)


### Features

* **api,worker:** template quality guard and LLM chain observability (P1b) ([#136](https://github.com/orestes-garcia-martinez/clawos/issues/136)) ([b064bb3](https://github.com/orestes-garcia-martinez/clawos/commit/b064bb39d46737ef868481b3c54d21322c2a7b87))
* **api:** add forensic logger for LLM observability ([#132](https://github.com/orestes-garcia-martinez/clawos/issues/132)) ([755f586](https://github.com/orestes-garcia-martinez/clawos/commit/755f586dac9d0c86dedf327af148fceafd8a453b))
* **api:** add P0 hallucination sanitizer and pending-action auto-save ([#134](https://github.com/orestes-garcia-martinez/clawos/issues/134)) ([526d80c](https://github.com/orestes-garcia-martinez/clawos/commit/526d80c940f9f423eeaf53318be98c3decd5ca4f))
* **api:** prevent cover letter worker bypass on rewrite requests (P1a) ([#135](https://github.com/orestes-garcia-martinez/clawos/issues/135)) ([beb6b77](https://github.com/orestes-garcia-martinez/clawos/commit/beb6b77fc74089fb10d7d8599eefbf8481f3a3f3))

## [0.7.4](https://github.com/orestes-garcia-martinez/clawos/compare/v0.7.3...v0.7.4) (2026-04-01)


### Bug Fixes

* **api:** handle unique constraint in saveSession upsert ([#130](https://github.com/orestes-garcia-martinez/clawos/issues/130)) ([d134978](https://github.com/orestes-garcia-martinez/clawos/commit/d13497829ceef607e2d61d0986bb59063e79ea15))

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
