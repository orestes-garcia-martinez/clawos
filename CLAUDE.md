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

## Quick Commands

```bash
npm ci && npm run build
npm run dev                     # all apps
npm run format                  # fix formatting (run before committing)
npm run lint && npm run typecheck && npm run format:check
npm run test
```

## Skills

Detailed knowledge is loaded on demand. Claude auto-triggers the right skill,
or invoke directly via `/slash-command`.

### Project Skills (`.claude/skills/`)

| Trigger                              | Skill                  | Covers                                                                                 |
| ------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------- |
| Modifying chat pipeline or auth      | `/clawos-architecture` | Two-call pattern, assertions, auth, session, failover, rate limiting, routing, billing |
| Asking about build/test/dev commands | `/clawos-commands`     | All dev, build, test, lint, format, gen:types commands                                 |
| Writing or reviewing code            | `/clawos-conventions`  | Code style, architecture rules, security non-negotiables, testing patterns             |
| Bumping versions or step 5 of ship   | `/clawos-versioning`   | Monorepo semver bump + changelog procedure                                             |
| Asking about deployment              | `/clawos-deployment`   | Vercel + Lightsail deploy targets, smoke tests                                         |

### Global Skills (`~/.claude/skills/`)

| Trigger                          | Skill           | Covers                                                                                                      |
| -------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------- |
| Shipping changes or opening a PR | `/ship-changes` | Git workflow, conventional commits, PR creation (reads `references/clawos.md` for scopes and test commands) |
