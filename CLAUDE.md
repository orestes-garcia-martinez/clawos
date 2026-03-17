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
npm ci                          # install (never npm install in CI)
npm run dev                     # all apps
npx turbo run dev --filter=@clawos/web
npx turbo run dev --filter=@clawos/api
npm run build                   # packages first, then apps
npm run lint && npm run typecheck
npm run test                    # unit tests (excludes *.integration.test.ts)
# integration tests require real env vars — see .env.example files
```

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

## Testing

- Unit tests: colocated as `*.test.ts`, run with `vitest run`
- Integration tests: `*.integration.test.ts`, require real env, run separately
- New routes → add route-level unit test with mocked dependencies
- New packages → add `vitest.config.ts` matching existing pattern

## Deployment Notes

- `apps/api` and `apps/web` deploy to Vercel automatically on merge to `main`
- `apps/worker` and `apps/telegram` deploy to Lightsail via `infra/lightsail/deploy-*.sh`
- Always run smoke tests (`infra/lightsail/smoke-worker-e2e.sh`) after Lightsail deploys
