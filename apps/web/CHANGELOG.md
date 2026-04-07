# Changelog

## [0.5.1] (2026-04-07)

### Bug Fixes

- **web:** linkify plain `https://` URLs in message bubbles; previously rendered as unclickable `<span>` elements while Telegram auto-linked the same URLs ([c130f74](https://github.com/orestes-garcia-martinez/clawos/commit/c130f748fc244f7a8b24a5f5a4bb66fa52ad5a3c))

## [0.5.0] (2026-04-06)

### Features

- **web:** add search radius select (10/25/50/100 mi, default 25 mi) to CareerClaw settings; shown only for onsite/hybrid work modes; cleared to null on save when switching to remote

## [0.4.0] (2026-04-04)

### Features

- **web:** replace 3-tab auth (sign-in / sign-up / magic-link) with a single-field magic-link-only page; `signInWithOtp` with `shouldCreateUser: true` handles new and returning users identically, eliminating all password flows ([5ab49ea](https://github.com/orestes-garcia-martinez/clawos/commit/5ab49ea9b28e5b2406f8422ac43339d40ba71957))
- **web:** redesign sidebar with floating `SkillSubNav` popover; hover/click on a skill row opens per-skill workspace navigation to the right; remove full-screen backdrop that was blocking row `mouseenter` events; filter `SkillSwitcher` to `status: available` skills only; relocate '+ Add Skills' to the top of `PlatformNav` ([5ab49ea](https://github.com/orestes-garcia-martinez/clawos/commit/5ab49ea9b28e5b2406f8422ac43339d40ba71957))

### Tests

- **web:** add unit tests for `PlatformNav` (7), `SkillSubNav` (16), and `SkillSwitcher` (11); configure vitest with jsdom environment and `@testing-library/react` ([0088dc5](https://github.com/orestes-garcia-martinez/clawos/commit/0088dc5d8fff1371babddb97d2807fcd1d03f483))

## [0.3.0] (2026-04-03)

### Features

- **web:** add favicon bundle (.ico, .svg, apple-touch-icon, PWA icons) and prebuild script that fetches live careerclaw-js version from npm to replace hardcoded version string ([ee0616f](https://github.com/orestes-garcia-martinez/clawos/commit/ee0616ffe6b7da6deee6fce0f0cfe22a06950877))

## [0.2.2] (2026-03-31)

### Bug Fixes

- **web:** set `pendingNewSessionRef` on `reset()` and send `newSession: true` on the first message after "New Conversation" so the API creates a fresh session instead of loading the previous one ([585262d](https://github.com/orestes-garcia-martinez/clawos/commit/585262d))

## [0.2.1] (2026-03-30)

### Bug Fixes

- **web:** add empty-response guard in `useSSEChat` `onDone` handler — shows `EMPTY_RESPONSE` error message instead of rendering a blank assistant bubble ([74f733e](https://github.com/orestes-garcia-martinez/clawos/commit/74f733e72f8ded3cfdb54087db32777873f52e76))

## [0.2.0](https://github.com/orestes-garcia-martinez/clawos/compare/web-v0.1.0...web-v0.2.0) (2026-03-26)


### Features

* **app:** clawos web app ([07a699a](https://github.com/orestes-garcia-martinez/clawos/commit/07a699ac3179075c2000e67c2e5464818a8a25be))
* **app:** clawos web app ([a1b8afc](https://github.com/orestes-garcia-martinez/clawos/commit/a1b8afc0dad93a98955f65471ce18fb367845ca8))
* **chat-1:** turborepo scaffold + CI/CD ([ed33b90](https://github.com/orestes-garcia-martinez/clawos/commit/ed33b90d1d732d32782dba9defda959fc7681cd7))
* **chat-1:** turborepo scaffold + CI/CD ([b512248](https://github.com/orestes-garcia-martinez/clawos/commit/b512248ed9793c495e5d3992a5b86b2a1aa067a6))
* **chat-5:** telegram adapter implementation ([40b90c0](https://github.com/orestes-garcia-martinez/clawos/commit/40b90c062afd85c88917d658601eb5a3a7a664d8))
* new account & careerclaw setting ui experience ([f00caaa](https://github.com/orestes-garcia-martinez/clawos/commit/f00caaa5f301cb4f5c0395d7aea77faf4a4ac45b))
* web app polar billing ([b907ccd](https://github.com/orestes-garcia-martinez/clawos/commit/b907ccd5b097c61130b81b96c8dd6b37e94f530b))
* web app polar billing ([12b2524](https://github.com/orestes-garcia-martinez/clawos/commit/12b2524d0ba48ccdcd697c93e729866416e85e25))
* web improvement phase 3 ([6cbc8af](https://github.com/orestes-garcia-martinez/clawos/commit/6cbc8afe3dec4d98b25425b79d8ad91d0bf8c0bd))
* **web:** implement manual job application tracking ([cfaca62](https://github.com/orestes-garcia-martinez/clawos/commit/cfaca62d9213912fcbb2aa1b7deb92c038822fca))
* **web:** implement manual job application tracking ([499e243](https://github.com/orestes-garcia-martinez/clawos/commit/499e243517ad47e79095d198f6a0fdbb06f26672))
* **web:** web app modernization phase 1 ([d9622e3](https://github.com/orestes-garcia-martinez/clawos/commit/d9622e32b377d960ffc9561b448365f8f7304624))
* **web:** web experience improvements phase 2 ([8a4611a](https://github.com/orestes-garcia-martinez/clawos/commit/8a4611a272730dbba0d66be4f75def3cd4dd5859))


### Bug Fixes

* **app:** pr comments ([8bb06ed](https://github.com/orestes-garcia-martinez/clawos/commit/8bb06ed390e93bb8651907320c1ae04cd69a4219))
* chat history lost ([c1997f7](https://github.com/orestes-garcia-martinez/clawos/commit/c1997f7ce1e8932b5a3b4e9426836b38047f9835))
* fix UX after manual test findings ([735b516](https://github.com/orestes-garcia-martinez/clawos/commit/735b51681f83ae82a595dec4457935b627ff78e1))
* linter ([284b06c](https://github.com/orestes-garcia-martinez/clawos/commit/284b06cb0e3582d47a5313ad7a1d372b56a2b83f))
* pr comments ([bc32879](https://github.com/orestes-garcia-martinez/clawos/commit/bc328790b7107fda4b1a30a84d14c6c12fa06b2e))
* prettier format ([7f8f098](https://github.com/orestes-garcia-martinez/clawos/commit/7f8f0983b7122aba72c314a4b777813352c3e00e))
* review comments ([f657f54](https://github.com/orestes-garcia-martinez/clawos/commit/f657f5457d20088b97cb0cc4e6bf6dd72dcf06af))
* web api matches api endpoints for billing ([0f90d0e](https://github.com/orestes-garcia-martinez/clawos/commit/0f90d0eb425caabf4451e8ba5b309d234a97513c))
* **web:** BUG-006 CareerClaw profile setup flow (work_mode + salary_min) ([c17a95c](https://github.com/orestes-garcia-martinez/clawos/commit/c17a95c19a48c44aca622f8c9ff952278ea920e7))
* **web:** re-hydrate chat thread on reload, hide location helper text (BUG-009, BUG-010) ([cbe3bd2](https://github.com/orestes-garcia-martinez/clawos/commit/cbe3bd2bc734a62d3dd65c91d1ef2addc963025d))
* **web:** re-hydrate chat thread on reload, hide location helper text… ([6bde7b0](https://github.com/orestes-garcia-martinez/clawos/commit/6bde7b0e51f0cf45832139bbfcb8d120993f7d33))
