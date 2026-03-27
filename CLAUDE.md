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

| Client | Header | Validated by |
|--------|--------|-------------|
| Web frontend | `Authorization: Bearer <supabase-jwt>` | Supabase auth endpoint |
| Telegram / channel adapters | `X-Service-Secret` + `X-Service-Name` + `X-User-Id` | `safeCompare()` against `SERVICE_SECRET` |
| Worker (inbound) | `x-worker-secret` | Timing-safe comparison against `WORKER_SECRET` |

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

## Deployment Notes

- `apps/api` and `apps/web` deploy to Vercel automatically on merge to `main`
- `apps/worker` and `apps/telegram` deploy to Lightsail via `infra/lightsail/deploy-*.sh`
- Always run smoke tests (`infra/lightsail/smoke-worker-e2e.sh`) after Lightsail deploys
