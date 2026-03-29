# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# ClawOS

Multi-channel AI agent platform — Web + Telegram. Node ≥22, npm ≥10, Turborepo monorepo.

## Apps & Packages

| Path                | Runtime                                   | Deploy            |
| ------------------- | ----------------------------------------- | ----------------- |
| `apps/api`          | Hono + Anthropic SDK + SSE                | Vercel serverless |
| `apps/web`          | React 19 + Vite 7 + Tailwind 4 + Router 7 | Vercel            |
| `apps/telegram`     | Telegram Bot API adapter                  | Lightsail         |
| `apps/worker`       | Express 5 + careerclaw-js CLI             | Lightsail         |
| `packages/shared`   | Supabase types, domain types, prompts     | —                 |
| `packages/security` | Zod schemas, rate-limit, audit log        | —                 |
| `packages/billing`  | Polar.sh billing client                   | —                 |

## Key Commands

```bash
npm ci                                              # install (never npm install in CI)
npm run dev                                         # all apps
npx turbo run dev --filter=@clawos/web
npx turbo run dev --filter=@clawos/api
npm run build                                       # packages first, then apps
npm run lint && npm run typecheck
npm run format                                      # Prettier write (run before committing)
npm run test                                        # unit tests (excludes *.integration.test.ts)
npx turbo run test --filter=@clawos/api             # single workspace tests
npx vitest run apps/api/src/routes/chat.test.ts     # single test file
npm run test:integration                            # requires real env vars — see .env.example files
npm run gen:types                                   # regenerate Supabase TypeScript types
```

## Architecture

### Claude Orchestration (Two-Call Pattern)

Every skill invocation uses two Claude calls in `apps/api/src/routes/chat.ts`:

1. **First call** — tool routing: Claude receives `run_careerclaw` and `track_application` tool definitions (from `@clawos/shared` prompts) and either produces a text reply or chooses a tool.
2. **Profile gate** — if Claude chose `run_careerclaw` but the user's profile is missing required fields, the request is blocked immediately with a message (no worker call).
3. **Skill execution** — API calls the Lightsail worker with a signed assertion + input.
4. **Second call** — formatting: raw tool result is passed back to Claude to produce a natural-language response.
5. **Session storage** — only the formatted summary is saved; raw skill output is never persisted.

Tools and their Zod types live in `packages/shared/src/prompts.ts`. The system prompt (`CAREERCLAW_SYSTEM_PROMPT`) is ~400 lines and channel-aware.

### Skill Assertion Flow

Skills are authorized via short-lived Ed25519-signed JWTs (`typ: CSAT`), not bearer tokens:

- **API** (`apps/api/src/skill-assertions.ts`) signs an assertion with `SKILL_ASSERTION_PRIVATE_KEY` (expires 10 min).
- **Worker** (`apps/worker/src/assertion-verifier.ts`) verifies signature against `SKILL_ASSERTION_PUBLIC_KEYS_JSON` (key rotation supported via `kid`).
- Claims include: `userId`, `skill`, `tier`, `features[]`, `aud: clawos-worker`.
- Implementation lives in `packages/security/src/assertions.ts`.

### Authentication Model

Three distinct auth paths into `apps/api`:

| Client                      | Header                                              | Validated by                                   |
| --------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| Web frontend                | `Authorization: Bearer <supabase-jwt>`              | Supabase auth endpoint                         |
| Telegram / channel adapters | `X-Service-Secret` + `X-Service-Name` + `X-User-Id` | `safeCompare()` against `SERVICE_SECRET`       |
| Worker (inbound)            | `x-worker-secret`                                   | Timing-safe comparison against `WORKER_SECRET` |

### Session Management

Sessions are keyed by `(userId, channel)` in Supabase. Before each Claude call, history is pruned to 20 messages / 8000 tokens (`apps/api/src/session.ts`). Soft-deleted after 30 days inactivity.

### LLM Failover

Primary: `claude-sonnet-4-20250514` via `@anthropic-ai/sdk`. Failover: `gpt-4o-mini` via `openai` SDK (text-only, no tool use). Failover triggers on network errors or HTTP 5xx; **not** on 400/401/403/429.

### Rate Limiting

In-memory sliding window per `userId` in `apps/api/src/ratelimit.ts`. Free: 10 req/hr, Pro: 60 req/hr. **Risk**: per-process state doesn't survive Vercel cold starts / multiple instances — Phase 2 migration to Redis (Upstash) is planned.

### Web Routing

`apps/web/src/App.tsx` has a skills-aware root redirect: reads `clawos-last-skill` from `localStorage`. 0 skills → `/home`, ≥1 skill → `/{lastSkill}/chat`. Skill installation state lives in `SkillsContext`.

### Billing / Entitlements

Polar.sh is authoritative for entitlements; Supabase stores a cache. The `getCustomerStateByExternalId()` function in `packages/billing` treats `null` (unknown customer) as free tier. `mapCustomerStateToEntitlements()` is a pure function: CustomerState → EntitlementResult. **Never call Polar on the hot chat path** — read from Supabase cache only.

## Code Conventions

- **TypeScript strict** across all packages — no `any`, no implicit returns
- **Zod** for all external input validation — use schemas from `@clawos/security` before writing new ones
- **ESM only** (`"type": "module"`) — no `require()`, no CommonJS
- **Prettier** enforced — run `npm run format` before committing
- **Shared types live in `@clawos/shared`** — never duplicate domain types across apps

## Architecture Rules

- The API layer (`apps/api`) owns Claude orchestration — no LLM calls from `apps/web` or `apps/telegram`
- Skills execute only through the `apps/worker` CLI wrapper — no runtime skill installation ever
- All DB access goes through Supabase with RLS — never bypass RLS even in server-side code
- SSE streaming is the response protocol for chat — do not buffer full responses

## Security Non-Negotiables

1. No secrets in code — env vars only (see `.env.example` per app)
2. `npm ci` only — never `npm install` in pipelines or production
3. All new Supabase tables must have RLS policies in `infra/supabase/migrations/`
4. New API routes must apply rate-limit middleware from `@clawos/security`
5. `npm audit --audit-level=high` blocks merge — do not suppress findings without documented justification
6. Always use `safeCompare()` from `@clawos/security` for secret comparisons — never `===`

## Testing

- Unit tests: colocated as `*.test.ts`, run with `vitest run`
- Integration tests: `*.integration.test.ts`, require real env, run separately
- Web app uses MSW (`msw` v2) for API mocking in tests
- New routes → add route-level unit test with mocked dependencies
- New packages → add `vitest.config.ts` matching existing pattern

## Ship Changes Workflow

When asked to "ship changes", follow these steps in order:

**1. Detect changes**
Run `git status` and `git diff HEAD` to understand what has changed and which workspace(s) are affected.

**2. Create a branch**
Ensure the branch creation step is idempotent: if a branch with the generated name already exists,
switch to it instead of trying to create a new one

Name the branch `<type>/<scope>-<short-description>` using the same types and scopes enforced by commitlint:

- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`
- Scopes: `api`, `web`, `worker`, `telegram`, `shared`, `billing`, `security`, `infra`, `ci`, `deps`, `release`

Example: `feat/worker-careerclaw-adapter`

**3. Commit**
Stage only the relevant files (never `git add -A` blindly). Write a conventional commit message:

```
<type>(<scope>): <short imperative summary>

<body explaining what changed and why — omit if obvious>
```

`feat` and `fix` drive version bumps via release-please; `chore`/`docs`/`ci` do not.

**4. Run tests and linting**

```bash
npm run lint && npm run typecheck
npm run test
```

If either fails, **stop**. Explain what is failing and the approach to fix it — do not write the fix code.

**5. Bump package versions**

For every workspace package that has changes in this branch (compared to `main`), bump its `package.json` version and update its `CHANGELOG.md`. See **Bump Package Versions** section below for the full procedure.

**6. Open a PR**

```bash
gh pr create \
  --title "<same as commit subject>" \
  --body "..."
```

PR body must include: **Summary** (bullet list of changes), **Test plan** (checklist), and **Release impact** (which root version release-please will produce and which individual packages were bumped).

## Bump Package Versions

This procedure is step 5 of the **Ship Changes Workflow**. It runs inside the feature branch before the PR is opened.

### 1. Identify affected packages

Find every workspace package whose files have changed relative to `main`:

```bash
git diff main...HEAD --name-only
```

A package is affected if any changed file lives under its directory (`apps/<name>/` or `packages/<name>/`).

### 2. Determine bump type per package

For each affected package, inspect the full conventional commit messages (subject + body) on this branch that touch that package's directory:

```bash
git log main...HEAD --pretty=format:"%B" -- <package-dir>/
```

Using `%B` (full body) instead of `%s` (subject only) ensures that breaking changes declared only in the commit footer (`BREAKING CHANGE:`) are not missed.

Apply semver rules (use the highest applicable rule across all commits for that package):

| Condition                                                               | Bump                        |
| ----------------------------------------------------------------------- | --------------------------- |
| Any commit subject matches `^[a-z]+(\(.+\))?!:` (bang notation)         | **major**                   |
| Any commit body/footer contains a line starting with `BREAKING CHANGE:` | **major**                   |
| Any commit subject starts with `feat`                                   | **minor**                   |
| Any commit subject starts with `fix`, `perf`, or `refactor`             | **patch**                   |
| Only `chore`, `docs`, `test`, `ci`, `style` commits                     | no bump — skip this package |

If no bump-worthy commits touch a package, leave it unchanged.

### 3. Bump `package.json`

For each affected package, update the `version` field in its `package.json` using semver arithmetic (do not use `npm version` — edit the file directly to avoid creating extra git tags).

### 4. Update `CHANGELOG.md`

For each affected package, prepend a new entry to its `CHANGELOG.md` (create the file if it does not exist) following Keep-a-Changelog / release-please format:

```markdown
## [<new-version>] (YYYY-MM-DD)

### Features

- **<scope>:** <description> ([<short-sha>](https://github.com/orestes-garcia-martinez/clawos/commit/<full-sha>))

### Bug Fixes

- **<scope>:** <description> ([<short-sha>](https://github.com/orestes-garcia-martinez/clawos/commit/<full-sha>))
```

Do not add a compare link to the version heading. Per-package tags no longer exist (release-please is root-only), so any `compare/<package>-v<old>...<package>-v<new>` URL would be a dead link. Individual commits are still linked inline.

Include only the sections that have entries. Use the actual commit messages and SHAs from `git log`.

### 5. Stage the changes

```bash
git add <package-dir>/package.json <package-dir>/CHANGELOG.md
```

Include these in the same commit as the feature changes (do not create a separate commit for version bumps).

## Deployment Notes

- `apps/web` deploy to Vercel automatically on merge to `main`
- `apps/api`, `apps/worker` and `apps/telegram` deploy to Lightsail via `infra/lightsail/deploy-*.sh` or git pull in Lightsail instance
- Always run smoke tests (`infra/lightsail/smoke-worker-e2e.sh`) after Lightsail deploys
