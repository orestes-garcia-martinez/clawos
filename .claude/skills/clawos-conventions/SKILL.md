---
name: clawos-conventions
description: >
  Code conventions, architecture rules, security requirements, and testing
  patterns for ClawOS. Use this skill when writing new code, reviewing PRs,
  adding routes, creating Supabase tables, adding tests, or asking about code
  style, security rules, or test patterns. Also trigger when the user asks
  "how should I write tests", "what are the security rules", "what code
  conventions do we follow", or when writing anything that touches Supabase RLS,
  API routes, or external input validation.
---

# ClawOS Conventions & Standards

## Code Conventions

- **TypeScript strict** across all packages — no `any`, no implicit returns
- **Zod** for all external input validation — use schemas from `@clawos/security`
  before writing new ones
- **ESM only** (`"type": "module"`) — no `require()`, no CommonJS
- **Prettier** enforced — run `npm run format` before committing
- **Shared types live in `@clawos/shared`** — never duplicate domain types
  across apps

## Architecture Rules

- The API layer (`apps/api`) owns Claude orchestration — no LLM calls from
  `apps/web` or `apps/telegram`
- Skills execute only through the `apps/worker` CLI wrapper — no runtime skill
  installation ever
- All DB access goes through Supabase with RLS — never bypass RLS even in
  server-side code
- SSE streaming is the response protocol for chat — do not buffer full responses

## Security Non-Negotiables

1. No secrets in code — env vars only (see `.env.example` per app)
2. `npm ci` only — never `npm install` in pipelines or production
3. All new Supabase tables must have RLS policies in
   `infra/supabase/migrations/`
4. New API routes must apply rate-limit middleware from `@clawos/security`
5. `npm audit --audit-level=high` blocks merge — do not suppress findings
   without documented justification
6. Always use `safeCompare()` from `@clawos/security` for secret comparisons —
   never `===`

## Testing Patterns

- **Unit tests:** colocated as `*.test.ts`, run with `vitest run`
- **Integration tests:** `*.integration.test.ts`, require real env, run
  separately via `npm run test:integration`
- **Web app:** uses MSW (`msw` v2) for API mocking in tests
- **New routes →** add route-level unit test with mocked dependencies
- **New packages →** add `vitest.config.ts` matching existing pattern
