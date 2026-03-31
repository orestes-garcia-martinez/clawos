# ClawOS MVP Security Review

Date: March 2026 | Scope: All apps + packages | Status: Pre-launch

---

## 1. Dependency Security

| Control                                      | Status       | Evidence                                                                        |
| -------------------------------------------- | ------------ | ------------------------------------------------------------------------------- |
| `npm audit` clean — zero high/critical       | ✅ Pass      | `found 0 vulnerabilities` after all Chat 1–7 installs                           |
| `@polar-sh/sdk` audit                        | ✅ Pass      | `found 0 vulnerabilities` post-install                                          |
| `node-telegram-bot-api` permanently excluded | ✅ Confirmed | Excluded in Chat 5 due to `request` library CVEs; uses `fetch` + `express` only |
| No runtime `npm install` anywhere            | ✅ Confirmed | All deps frozen at deploy time; no dynamic installs in worker or adapters       |
| Socket.dev scan in CI                        | ✅ Wired     | `.github/workflows/ci.yml` job: `security`                                      |
| Snyk scan in CI                              | ✅ Wired     | `.github/workflows/ci.yml` job: `security`                                      |

---

## 2. API Authentication

| Endpoint                              | Auth mechanism                                                | Status                                       |
| ------------------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| `POST /chat`                          | Supabase JWT (`Authorization: Bearer`) or service-secret path | ✅ requireAuth() on every request            |
| `POST /resume/extract`                | Supabase JWT                                                  | ✅ requireAuth()                             |
| `POST /link-token`                    | Supabase JWT                                                  | ✅ requireAuth()                             |
| `POST /billing/checkout`              | Supabase JWT                                                  | ✅ requireAuth()                             |
| `POST /billing/portal`                | Supabase JWT                                                  | ✅ requireAuth()                             |
| `POST /billing/webhooks/polar`        | HMAC-SHA256 (`webhook-signature`)                             | ✅ verifyWebhook() before any DB write       |
| `POST /internal/billing/sync/:userId` | `X-Internal-Api-Key` constant-time compare                    | ✅ Separate from SERVICE_SECRET              |
| `GET /health`                         | None (public)                                                 | ✅ Intentional — returns only status/version |
| Unauthenticated → 401 (no detail)     | All protected routes                                          | ✅ Confirmed by unit tests auth.test.ts      |

Service-to-service auth (Telegram → API):

- `X-Service-Secret` constant-time comparison via `timingSafeEqual`
- `X-Service-Name` must be in `KNOWN_SERVICES = ['telegram', 'whatsapp']`
- `X-User-Id` is the Supabase UUID, looked up from `channel_identities`

---

## 3. Webhook Signature Validation

| Webhook                                | Validation                                                    | Status                             |
| -------------------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| Telegram → `POST /webhook`             | `X-Telegram-Bot-Api-Secret-Token` constant-time compare       | ✅ Before body read                |
| Polar → `POST /billing/webhooks/polar` | `validateEvent()` from `@polar-sh/sdk/webhooks` (HMAC-SHA256) | ✅ Rejects 401 before any DB write |
| Unsigned webhook → body never read     | Both adapters                                                 | ✅ Confirmed                       |

---

## 4. Row Level Security (RLS) Audit

All tables have `enable row level security`. Policies verified below:

| Table                     | Select policy          | Insert/Update/Delete            |
| ------------------------- | ---------------------- | ------------------------------- |
| `users`                   | `auth.uid() = id`      | Trigger (service role) only     |
| `channel_identities`      | `auth.uid() = user_id` | Service role (Telegram adapter) |
| `sessions`                | `auth.uid() = user_id` | Service role (Agent API)        |
| `careerclaw_profiles`     | `auth.uid() = user_id` | Service role                    |
| `careerclaw_runs`         | `auth.uid() = user_id` | Service role                    |
| `careerclaw_job_tracking` | `auth.uid() = user_id` | Service role                    |
| `link_tokens`             | `auth.uid() = user_id` | Service role                    |
| `user_skills`             | `auth.uid() = user_id` | Service role                    |
| `user_skill_entitlements` | `auth.uid() = user_id` | Service role (webhook handler)  |
| `billing_webhook_events`  | No user SELECT policy  | Service role only               |

**RLS verification tests**: `billing.integration.test.ts` tests 5–6 confirm users cannot read each other's `user_skill_entitlements` rows via JWT.

**Known gap to verify pre-launch**: Run `SELECT * FROM pg_policies` in the Supabase SQL editor and confirm no `PERMISSIVE` policies exist without a `USING` clause.

---

## 5. Input Validation

| Layer                         | Validation                                                                  | Status                               |
| ----------------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| `/chat` body                  | `ChatRequestSchema` (Zod, `@clawos/security`)                               | ✅ Rejects malformed before LLM call |
| `/resume/extract` multipart   | `bodyLimit(6MB)` + mime check                                               | ✅                                   |
| Worker `/run/careerclaw` body | `CareerClawRunSchema` (Zod, `@clawos/security`)                             | ✅                                   |
| Telegram update               | `TelegramUpdate` type guard + document mime check                           | ✅                                   |
| Billing webhook body          | Raw body → `verifyWebhook` → SDK-parsed types                               | ✅                                   |
| Worker CLI args               | Never constructed from raw user input; profile fields from validated DB row | ✅                                   |
| Resume text                   | 50 000 char truncation in `careerclaw_profiles` (DB constraint)             | ✅                                   |

---

## 6. Rate Limiting

| Tier             | Limit                                             | Implementation                                                           | Status |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------ | ------ |
| Free             | 10 req/hr                                         | In-memory sliding window per `userId`                                    | ✅     |
| Pro              | 60 req/hr                                         | In-memory sliding window per `userId`                                    | ✅     |
| 429 response     | `Retry-After` header included                     | ✅                                                                       |
| Rate limit store | Per-process in-memory (`Map<userId, timestamps>`) | ✅ — acceptable for MVP; Phase 2 can add Redis/Upstash if abuse observed |

---

## 7. Secrets & Credential Handling

| Secret                      | Storage                                           | Status |
| --------------------------- | ------------------------------------------------- | ------ |
| `SUPABASE_SERVICE_ROLE_KEY` | Env var only; never in browser or logs            | ✅     |
| `CLAWOS_ANTHROPIC_KEY`      | Env var; isolated from `CAREERCLAW_ANTHROPIC_KEY` | ✅     |
| `WORKER_SECRET`             | Env var; constant-time compare in worker          | ✅     |
| `SERVICE_SECRET`            | Env var; constant-time compare in API auth        | ✅     |
| `LINK_TOKEN_SECRET`         | Env var; HMAC-only, single-use tokens, 10-min TTL | ✅     |
| `POLAR_WEBHOOK_SECRET`      | Env var; never logged                             | ✅     |
| `POLAR_ACCESS_TOKEN`        | Env var; never stored in DB                       | ✅     |
| `INTERNAL_API_KEY`          | Env var; distinct from SERVICE_SECRET             | ✅     |
| `TELEGRAM_BOT_TOKEN`        | Env var; never in browser                         | ✅     |
| Raw resume text             | DB only; never in logs or audit entries           | ✅     |
| Polar billing secrets       | Never stored in DB                                | ✅     |
| `VITE_SUPABASE_ANON_KEY`    | Browser-safe anon key only                        | ✅     |

---

## 8. Audit Logging

All Agent API invocations log via `buildAuditEntry()`:

```
{ userId, skill, channel, status, statusCode, durationMs, timestamp }
```

**What is never logged** (verified in `audit.test.ts`):

- Raw message bodies
- Resume text
- Full LLM prompts or responses
- Polar API keys or billing payloads beyond event type

---

## 9. Infrastructure

| Control                                                      | Status                                       |
| ------------------------------------------------------------ | -------------------------------------------- |
| SSH key-only auth on Lightsail                               | ✅ (password login disabled at provisioning) |
| Worker runs as non-root `clawos-worker` user                 | ✅ Enforced in systemd service               |
| Nginx: `proxy_buffering off` for SSE                         | ✅ `nginx-api.conf`                          |
| HTTPS only via Certbot (Let's Encrypt) on `api.clawoshq.com` | ✅                                           |
| CORS: strict origin whitelist (`ALLOWED_ORIGIN`)             | ✅ — no wildcard                             |
| Lightsail firewall: ports 22, 80, 443 only                   | ✅ (webhook port internal)                   |

---

## 10. Performance Baseline Targets

| Metric                                    | Target   | Test method                                       |
| ----------------------------------------- | -------- | ------------------------------------------------- |
| `/chat` p95 (text response, no worker)    | < 3 s    | Integration test: `chat.text.integration.test.ts` |
| `/chat` p95 (CareerClaw skill invocation) | < 5 s    | Integration test: `chat.text.integration.test.ts` |
| Telegram bot response (text)              | < 6 s    | Integration test: `index.integration.test.ts`     |
| Webhook processing (state_changed → DB)   | < 500 ms | Integration test: `billing.integration.test.ts`   |

Measure these after deploying Chat 7 to Lightsail. Log `durationMs` from audit entries for p95 calculation.

---

## 11. Pre-Launch Checklist

- [ ] Apply migration `20260324000008_billing_schema.sql` to production Supabase
- [ ] Set all 7 new billing env vars on `clawos-api` systemd service and redeploy
- [ ] Confirm `npm audit` clean in production environment after deploy
- [ ] Verify `billing_webhook_events` table exists and RLS is enabled
- [ ] Register Polar webhook URL: `https://api.clawoshq.com/billing/webhooks/polar`
- [ ] Set `POLAR_ENV=production` for live billing (currently `sandbox`)
- [ ] Run `infra/lightsail/register-telegram-webhook.sh` if webhook URL changed
- [ ] Unpublish CareerClaw from Gumroad and redirect to `app.clawoshq.com`
- [ ] Run integration test suite against production: `npm run test:integration`
- [ ] Confirm zero high/critical findings in final `npm audit`

---

## 12. Known Accepted Risks (MVP)

| Risk                                                          | Mitigation                                                      | Phase    |
| ------------------------------------------------------------- | --------------------------------------------------------------- | -------- |
| In-memory rate limiter is per-process (Vercel multi-instance) | Acceptable at MVP scale; upgrade to Redis/Upstash at Phase 2    | Phase 2  |
| `billing_webhook_events` has no user-level SELECT policy      | Internal-only table; service role access only; no data exposure | Accepted |
| Focus trap in modals not implemented (a11y)                   | Documented in UX backlog                                        | Phase 2  |
| Single Lightsail instance (no redundancy)                     | Acceptable at MVP; evaluate at Phase 2                          | Phase 2  |
