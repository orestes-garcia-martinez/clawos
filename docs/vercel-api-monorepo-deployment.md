# Vercel deployment guide (monorepo API)

This repository uses npm workspaces (`apps/*`, `packages/*`). The API workspace (`apps/api`) depends on local packages (`@clawos/shared`, `@clawos/security`, `@clawos/billing`), so the deployment must run with monorepo context.

## Recommended setup for the API Vercel project

1. In Vercel, create a **separate project for the API**.
2. Point it to this repository.
3. Set **Root Directory** to the repository root (`/`).
4. Keep **Install Command** as `npm ci`.
5. Leave **Build Command** empty (functions-first deployment).
6. If possible, leave **Output Directory** empty.
   - If your Vercel project is currently pinned to `public`, this repo now includes `apps/api/public/.gitkeep` and sets `outputDirectory: "public"` in `apps/api/vercel.json` so builds do not fail while you migrate settings.
7. Ensure the project uses the repository `vercel.json` at root.

## Why this works

- Root-level install resolves workspace dependencies correctly.
- `vercel.json` rewrites all routes to `apps/api/api/index.ts`.
- The serverless entry uses the Hono Node adapter (`@hono/node-server/vercel`) with `runtime: nodejs`.

## If deploy still fails

Collect and share these log lines:

- Install phase errors (`npm ci` output)
- Build/function tracing errors
- Runtime errors from `/health`

The first failing phase usually identifies whether the issue is:

- workspace dependency resolution,
- function entry routing,
- or runtime environment variables.


## Legacy `public` output directory failure

If deploy logs say `No Output Directory named "public" found`, your Vercel project still expects a static build output.

This PR hardens API deploys by:

- explicitly setting `outputDirectory` to `public` in `apps/api/vercel.json`,
- committing `apps/api/public/.gitkeep`, and
- using `@vercel/node` build + route mapping for `api/index.ts`.

This keeps serverless API deploys working even before project settings are fully cleaned up.
