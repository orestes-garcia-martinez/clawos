---
name: clawos-commands
description: >
  Quick reference for all ClawOS build, dev, test, lint, typecheck, format, and
  type generation commands. Use this skill when the user asks "how do I build",
  "how do I test", "how do I run dev", "run a single workspace", "run a single
  test file", "regenerate types", or any variation of "what commands are
  available". Also use when you need to run a command and aren't sure of the
  exact invocation.
---

# ClawOS Commands

## Install

```bash
npm ci                  # always use ci, never npm install in CI
```

## Dev

```bash
npm run dev                                    # all apps
npx turbo run dev --filter=@clawos/web         # web only
npx turbo run dev --filter=@clawos/api         # api only
```

## Build

```bash
npm run build           # packages first, then apps (Turborepo ordered)
```

## Lint & Format

```bash
npm run lint            # ESLint
npm run typecheck       # tsc --noEmit across workspaces
npm run format          # Prettier write (run before committing)
npm run format:check    # Prettier check (CI gate)
```

## Test

```bash
npm run test                                           # unit tests (excludes *.integration.test.ts)
npx turbo run test --filter=@clawos/api                # single workspace
npx vitest run apps/api/src/routes/chat.test.ts        # single file
npm run test:integration                               # requires real env vars — see .env.example
```

## Code Generation

```bash
npm run gen:types       # regenerate Supabase TypeScript types
```
