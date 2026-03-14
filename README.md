# ClawOS

Multi-channel AI agent platform delivering career, research, and investment intelligence via Web and Telegram.

> **Status**: Chat 1 of 8 — Turborepo scaffold + CI/CD  
> **Strategy**: `ClawOS_Platform_Strategy_v1.4.docx`  
> **Build plan**: `ClawOS_MVP_Chat_Guide_v2.docx`

---

## Monorepo Structure

```
clawos/
├── apps/
│   ├── api/          Node.js + Hono — Agent API (Vercel serverless)
│   ├── web/          React + Vite + Tailwind 4 — Web frontend (Vercel)
│   ├── telegram/     Telegram bot adapter (Lightsail)
│   └── worker/       Lightsail skill CLI worker — Express wrapper for careerclaw-js
├── packages/
│   ├── shared/       Shared TypeScript domain types
│   ├── billing/      Polar.sh billing client stub
│   └── security/     Zod schemas, rate-limit config, audit log helpers
└── .github/
    └── workflows/
        └── ci.yml    Security scan + lint + typecheck + test
```

---

## Prerequisites

| Tool    | Version  |
| ------- | -------- |
| Node.js | ≥ 22.0.0 |
| npm     | ≥ 10.0.0 |

---

## Local Setup

```bash
# 1. Clone
git clone https://github.com/orestes-garcia-martinez/clawos.git
cd clawos

# 2. Install all workspace dependencies
npm ci

# 3. Copy env files
cp apps/api/.env.example       apps/api/.env
cp apps/worker/.env.example    apps/worker/.env
cp apps/telegram/.env.example  apps/telegram/.env
cp apps/web/.env.example       apps/web/.env

# Fill in each .env — never commit .env files

# 4. Run all apps in dev mode
npm run dev

# Or run a single app
npx turbo run dev --filter=@clawos/web
npx turbo run dev --filter=@clawos/api
```

---

## Individual Dev Ports

| App             | Port |
| --------------- | ---- |
| `apps/web`      | 5173 |
| `apps/api`      | 3001 |
| `apps/worker`   | 3002 |
| `apps/telegram` | 3003 |

---

## CI / Security

CI runs on every push and PR. Three jobs:

**Security** (blocks merge on HIGH/CRITICAL findings)

- `npm audit --audit-level=high` — known CVE detection
- Socket.dev — supply chain, typosquatting, malicious package detection
- Snyk — CVE scanning + license compliance

**Quality**

- ESLint v9 flat config
- TypeScript typecheck across all workspaces
- Prettier format check

**Test**

- Vitest across all workspaces

### Required GitHub Secrets

Add these at `Settings → Secrets and variables → Actions`:

| Secret           | Where to get it             |
| ---------------- | --------------------------- |
| `SOCKET_API_KEY` | https://socket.dev          |
| `SNYK_TOKEN`     | https://app.snyk.io/account |

---


## Vercel (API in monorepo)

Use the root deployment guide for the API project: `docs/vercel-api-monorepo-deployment.md`.

## Lightsail SSH

```bash
ssh -i "$env:USERPROFILE\.ssh\LightsailDefaultKey-us-east-1.pem" \
    openclaw-admin@100.103.12.74
```

`careerclaw-js` is already installed globally on this instance.

---

## Build

```bash
# All workspaces
npm run build

# Single workspace
npx turbo run build --filter=@clawos/api
```

---

## Architecture (MVP)

```
User (Web / Telegram)
        │
        ▼
  Channel Layer         Web chat UI · Telegram Bot API
        │
        ▼
  Agent Layer           Hono API (Vercel) · Claude API orchestration · SSE streaming
        │
        ▼
  Skills Layer          careerclaw-js CLI (Lightsail worker · Express)
        │
        ▼
  Platform Layer        Supabase (Auth · PostgreSQL · RLS) · Polar.sh (billing)
```

---

## Security Principles

1. **No third-party skill installation at runtime — ever.** All skill engines are first-party npm packages.
2. **npm audit + Socket.dev + Snyk block merge** on high/critical findings.
3. **Lockfile enforced** — `npm ci` in all pipelines. `npm install` never runs in production.
4. **Secrets never in code** — environment variables only. See `.env.example` files.
5. **Principle of least privilege** — RLS on every Supabase table, non-root CLI execution, isolated API keys.

---

## MVP Build Plan

| Chat | Deliverable                     | Status  |
| ---- | ------------------------------- | ------- |
| 1    | Turborepo scaffold + CI/CD      | ✅ Done |
| 2    | Supabase schema + RLS           | ⬜ Next |
| 3    | Lightsail skill worker          | ⬜      |
| 4    | Agent API (Hono + Claude + SSE) | ⬜      |
| 5    | Telegram adapter                | ⬜      |
| 6    | Web frontend                    | ⬜      |
| 7    | Billing (Polar.sh)              | ⬜      |
| 8    | E2E testing + security review   | ⬜      |

---

_ClawOS · Confidential · Orestes Garcia Martinez · March 2026_
