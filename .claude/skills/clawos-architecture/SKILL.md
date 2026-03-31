---
name: clawos-architecture
description: >
  Deep architectural reference for ClawOS. Use this skill when modifying the
  chat pipeline, Claude orchestration, authentication, session management, LLM
  failover, rate limiting, skill assertions, web routing, or billing. Also use
  when touching chat.ts, session.ts, ratelimit.ts, skill-assertions.ts,
  assertion-verifier.ts, prompts.ts, App.tsx, or any file in packages/billing
  or packages/security. Trigger on questions like "how does the two-call pattern
  work", "how does auth work", "what is a skill assertion", "how does billing
  work", or "how does the chat pipeline work".
---

# ClawOS Architecture

## Claude Orchestration (Two-Call Pattern)

Every skill invocation uses two Claude calls in `apps/api/src/routes/chat.ts`:

1. **First call — tool routing:** Claude receives `run_careerclaw` and
   `track_application` tool definitions (from `@clawos/shared` prompts) and
   either produces a text reply or chooses a tool.
2. **Profile gate:** if Claude chose `run_careerclaw` but the user's profile is
   missing required fields, the request is blocked immediately with a message
   (no worker call).
3. **Skill execution:** API calls the Lightsail worker with a signed assertion +
   input.
4. **Second call — formatting:** raw tool result is passed back to Claude to
   produce a natural-language response.
5. **Session storage:** only the formatted summary is saved; raw skill output is
   never persisted.

Tools and their Zod types live in `packages/shared/src/prompts.ts`. The system
prompt (`CAREERCLAW_SYSTEM_PROMPT`) is ~400 lines and channel-aware.

## Skill Assertion Flow

Skills are authorized via short-lived Ed25519-signed JWTs (`typ: CSAT`), not
bearer tokens:

- **API** (`apps/api/src/skill-assertions.ts`) signs an assertion with
  `SKILL_ASSERTION_PRIVATE_KEY` (expires 10 min).
- **Worker** (`apps/worker/src/assertion-verifier.ts`) verifies signature against
  `SKILL_ASSERTION_PUBLIC_KEYS_JSON` (key rotation supported via `kid`).
- Claims include: `userId`, `skill`, `tier`, `features[]`, `aud: clawos-worker`.
- Implementation lives in `packages/security/src/assertions.ts`.

## Authentication Model

Three distinct auth paths into `apps/api`:

| Client                      | Header                                              | Validated by                                   |
| --------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| Web frontend                | `Authorization: Bearer <supabase-jwt>`              | Supabase auth endpoint                         |
| Telegram / channel adapters | `X-Service-Secret` + `X-Service-Name` + `X-User-Id` | `safeCompare()` against `SERVICE_SECRET`       |
| Worker (inbound)            | `x-worker-secret`                                   | Timing-safe comparison against `WORKER_SECRET` |

## Session Management

Sessions are keyed by `(userId, channel)` in Supabase. Before each Claude call,
history is pruned to 20 messages / 8000 tokens (`apps/api/src/session.ts`).
Soft-deleted after 30 days inactivity.

## LLM Failover

Primary: `claude-sonnet-4-20250514` via `@anthropic-ai/sdk`. Failover:
`gpt-4o-mini` via `openai` SDK (text-only, no tool use). Failover triggers on
network errors or HTTP 5xx; **not** on 400/401/403/429.

## Rate Limiting

In-memory sliding window per `userId` in `apps/api/src/ratelimit.ts`.
Free: 10 req/hr, Pro: 60 req/hr.

**Risk:** per-process state doesn't survive Vercel cold starts / multiple
instances — Phase 2 migration to Redis (Upstash) is planned.

## Web Routing

`apps/web/src/App.tsx` has a skills-aware root redirect: reads
`clawos-last-skill` from `localStorage`. 0 skills → `/home`, ≥1 skill →
`/{lastSkill}/chat`. Skill installation state lives in `SkillsContext`.

## Billing / Entitlements

Polar.sh is authoritative for entitlements; Supabase stores a cache. The
`getCustomerStateByExternalId()` function in `packages/billing` treats `null`
(unknown customer) as free tier. `mapCustomerStateToEntitlements()` is a pure
function: CustomerState → EntitlementResult.

**Never call Polar on the hot chat path** — read from Supabase cache only.
