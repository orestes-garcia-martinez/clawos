# Contributing to ClawOS

Thank you for contributing. This guide covers the development workflow, commit conventions, and release process for the ClawOS monorepo.

---

## Table of Contents

- [Requirements](#requirements)
- [Getting Started](#getting-started)
- [Monorepo Structure](#monorepo-structure)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Pull Request Workflow](#pull-request-workflow)
- [Automated Releases](#automated-releases)
- [Scripts Reference](#scripts-reference)

---

## Requirements

- **Node.js** ≥ 20
- **npm** ≥ 10

Check your versions:

```bash
node -v
npm -v
```

---

## Getting Started

```bash
npm install
```

This also installs Husky's git hooks via the `prepare` script. After this, every commit will be validated automatically.

Run the full build across all packages:

```bash
npx turbo build
```

---

## Monorepo Structure

ClawOS uses a [Turborepo](https://turbo.build/) monorepo. Each app and package has its own scope used in commit messages, changelogs, and CI.

| Scope      | Path                  | Description                              |
| ---------- | --------------------- | ---------------------------------------- |
| `api`      | `apps/api/`           | Hono Agent API — Claude orchestration    |
| `web`      | `apps/web/`           | React + Vite web frontend                |
| `worker`   | `apps/worker/`        | Lightsail skill CLI worker               |
| `telegram` | `apps/telegram/`      | Telegram bot adapter                     |
| `shared`   | `packages/shared/`    | Shared TypeScript types + Supabase client|
| `billing`  | `packages/billing/`   | Polar.sh billing integration             |
| `security` | `packages/security/`  | Zod schemas, rate limits, audit logging  |
| `infra`    | `infra/`              | Deployment scripts, Nginx, systemd files |
| `ci`       | `.github/workflows/`  | GitHub Actions workflows                 |
| `deps`     | —                     | Dependency updates                       |
| `release`  | —                     | Release Please PRs                       |

---

## Branch Naming

All branches must follow this pattern:

```
<type>/<scope>-<short-description-in-kebab-case>
```

**Valid types:** `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `perf`, `refactor`, `revert`, `style`, `test`

**Examples:**

```bash
git checkout -b feat/api-add-rate-limiting
git checkout -b fix/web-sse-reconnect
git checkout -b chore/deps-upgrade-hono
git checkout -b ci/add-snyk-scan
```

---

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint + Husky.

### Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

- **type** — one of the types in the table below
- **scope** — the package or area changed (see [Monorepo Structure](#monorepo-structure) for valid scopes)
- **subject** — short description, lowercase, no period at the end

### Types and Version Impact

| Type       | Description                         | Version Bump |
| ---------- | ----------------------------------- | ------------ |
| `feat`     | New feature                         | Minor        |
| `fix`      | Bug fix                             | Patch        |
| `perf`     | Performance improvement             | Patch        |
| `docs`     | Documentation only                  | None         |
| `style`    | Code style (formatting, semicolons) | None         |
| `refactor` | Code change (no bug fix or feature) | None         |
| `test`     | Adding or correcting tests          | None         |
| `build`    | Build system or dependencies        | None         |
| `ci`       | CI/CD changes                       | None         |
| `chore`    | Maintenance tasks                   | None         |
| `revert`   | Revert a previous commit            | Varies       |

### Breaking Changes

Add `!` after the type to trigger a **major** version bump:

```bash
feat(api)!: replace REST chat endpoint with streaming-only contract
```

Or include `BREAKING CHANGE:` in the footer:

```bash
feat(shared): add skill entitlement types

BREAKING CHANGE: removes legacy LicensePayload type — update all callers to EntitlementResult
```

### Examples

✅ Valid:

```bash
git commit -m "feat(api): add skill worker timeout handling"
git commit -m "fix(web): correct SSE reconnect on token expiry"
git commit -m "feat(worker): expose health check endpoint"
git commit -m "chore(deps): upgrade careerclaw-js to 1.0.5"
git commit -m "ci: add commitlint PR title check"
git commit -m "docs: update contributing guide for monorepo"
```

❌ Invalid (will be rejected by commitlint):

```bash
git commit -m "add feature"              # missing type
git commit -m "feat: Add Feature"        # subject must be lowercase
git commit -m "feat(unknown): add thing" # unknown scope
git commit -m "feat:"                    # empty subject
git commit -m "fixed bug"               # wrong format
```

### Pre-commit Hooks

Husky runs automatically on every commit:

- **commit-msg** — validates commit message format with commitlint

If a commit is rejected, read the error message. The most common fix is correcting the type, scope, or subject format using the examples above.

---

## Pull Request Workflow

1. Create a branch from `main` following the [naming convention](#branch-naming)
2. Make your changes with [conventional commits](#commit-messages)
3. Push and open a PR to `main`
4. CI runs automatically — all checks must pass before merge
5. Get approval and merge using **squash merge**

> Squash merge is required. The squash commit title becomes the merge commit on `main`
> and must itself follow the conventional commit format — CI validates it.

### CI Checks

| Check          | Description                                             |
| -------------- | ------------------------------------------------------- |
| **Security**   | `npm audit --audit-level=high`                          |
| **Supply chain** | Socket.dev scan for malicious packages               |
| **CVE scan**   | Snyk dependency and code scanning                       |
| **Quality**    | ESLint v9 + TypeScript + Prettier across all packages   |
| **Tests**      | Vitest across all packages via `turbo test`             |
| **Commitlint** | PR title validated against conventional commit format   |

All checks are non-negotiable. A high or critical security finding blocks merge until resolved.

---

## Automated Releases

We use [Release Please](https://github.com/googleapis/release-please) in manifest mode to automate versioning and GitHub releases across the monorepo. Each package is versioned independently.

### How It Works

**Step 1** — Merge conventional commits to `main`:

```
feat(api): add billing webhook endpoint
fix(worker): handle careerclaw-js timeout correctly
```

**Step 2** — Release Please opens or updates a single grouped Release PR:

```
chore: release
```

This PR bumps the version in each changed package's `package.json` and regenerates its `CHANGELOG.md`. Packages with no new commits are untouched.

**Step 3** — When you merge the Release PR:

- A git tag is created per released package (e.g. `apps/api-v1.2.0`)
- A GitHub Release is published with the combined changelog

### Version Bumping Rules

| Commits include            | Version change | Example        |
| -------------------------- | -------------- | -------------- |
| Only `fix`, `perf`, `docs` | Patch          | 1.0.0 → 1.0.1  |
| Any `feat`                 | Minor          | 1.0.0 → 1.1.0  |
| Any `feat!` or `BREAKING`  | Major          | 1.0.0 → 2.0.0  |

### Which Packages Get Released

Only packages with new conventional commits since their last release appear in the Release PR. A commit scoped to `worker` does not trigger a release for `api` or `shared`.

### When to Merge the Release PR

The Release PR stays open and updates automatically as you merge more commits. You control when to ship:

- **Regular cadence** — merge after a meaningful batch of features
- **Hotfix** — merge immediately after a critical bug fix lands
- **No rush** — leaving it open is fine; it keeps accumulating changes

### Commits Hidden from the Changelog

These types are excluded from the public changelog by default:

- `chore` — maintenance tasks
- `style` — code formatting
- `test` — test changes

They still trigger a Release PR update if they are the only changes, but they will not appear in the release notes.

---

## Security

Security is ClawOS's primary non-functional requirement. Every contributor is responsible for it.

- **Never introduce a new dependency without checking it** with `npm audit` and reviewing the package on [Socket.dev](https://socket.dev/)
- **Never install packages at runtime** — dependencies are frozen at deploy time
- **Never commit secrets** — use `.env.example` files only; real credentials go in environment variables
- **Never use `npm install` in CI or on servers** — always use `npm ci`
- High or critical `npm audit` findings block all merges until resolved — no exceptions

---

## Scripts Reference

Run scripts from the monorepo root. Turborepo handles cross-package orchestration automatically.

| Command                            | Description                                     |
| ---------------------------------- | ----------------------------------------------- |
| `npx turbo build`                  | Build all packages                              |
| `npx turbo test`                   | Run Vitest across all packages                  |
| `npx turbo lint`                   | Run ESLint across all packages                  |
| `npx turbo typecheck`              | TypeScript check across all packages            |
| `npm run prepare`                  | Initialize Husky (runs automatically on install)|
| `npm audit --audit-level=high`     | Check for high/critical CVEs                    |

To run a script for a single package only:

```bash
npx turbo build --filter=api
npx turbo test --filter=worker
npx turbo lint --filter=web
```
