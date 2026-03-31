# Changelog

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
