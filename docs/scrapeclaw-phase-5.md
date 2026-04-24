# ScrapeClaw — Demo Package Generation (Insight Engine)

Status: Implemented
Applies to: ClawOS Post-MVP ScrapeClaw
Supersedes: None

## What this phase implements

Phase 5 turns a researched+enriched prospect into a buyer-facing **Strategic
Audit** package. It adds an insight layer on top of the raw evidence and
renders four deterministic, byte-stable artifacts plus the integrity
manifest that Phase 6 will verify at approval time.

Per-run output:

1. **`Executive_Summary.md`** — ≤ 400 words, sales-facing. Leads with the
   Market Threat Level (`low` / `medium` / `high`) and a single CTA to the
   automation upsell. Meant to be readable in under 10 seconds.
2. **`Competitive_Matrix.csv`** — one row per insight. Columns: `insight_id,
category, dimension, client_value, prospect_value, gap_type,
detection_confidence, threat_contribution, action_hook, action,
evidence_ids`. CRM-portable.
3. **`Evidence_Manifest.json`** — machine-ready. Every insight carries a
   `suggestedPayload` envelope with `skill_target` (`INBOUND_LEAD_INTAKE` |
   `INTERNAL_STATUS_TRIGGER` | `OUTBOUND_MARKET_SYNC`), `action`, loose
   `parameters: Record<string, unknown>`, and mandatory `detection_confidence`.
4. **`ClawOS_Verification.manifest`** — sha256 integrity document. Carries
   the sha256 of the other three artifacts plus its own self-hash
   (`manifestSha256`). Phase 6/7 verifies against this at approval and send.

## Pipeline (pure, in-memory)

```
prospect row + business row + evidence rows + baseline
  → buildInsightReport   (package-insights.ts)
      detect per dimension → classify gap → assign action hook →
      build suggested_payload → score threat
  → assembleDemoPackage  (package.ts)
      render MD + CSV + JSON → compute hashes → write self-hashing manifest
```

Everything is deterministic. Same input → byte-identical artifacts → identical
hashes. `generatedAt` is caller-supplied (defaults to `prospect.updated_at`);
never `new Date()` at render time. JSON is emitted via `canonicalJsonStringify`
which sorts object keys recursively.

## Insight engine — dimensions and weights

| Dimension             | Category     | Default Hook              | Heavy weight?                         |
| --------------------- | ------------ | ------------------------- | ------------------------------------- |
| Management Fee        | Pricing      | `OUTBOUND_MARKET_SYNC`    | No                                    |
| Leasing Fee           | Pricing      | `OUTBOUND_MARKET_SYNC`    | No                                    |
| Maintenance Hours     | Operations   | `INTERNAL_STATUS_TRIGGER` | **Yes (weight 4 for differentiator)** |
| Response Time         | Operations   | `INBOUND_LEAD_INTAKE`     | **Yes (weight 4 for differentiator)** |
| Public Business Email | Reachability | `INBOUND_LEAD_INTAKE`     | No                                    |
| Public Business Phone | Reachability | `INBOUND_LEAD_INTAKE`     | No                                    |
| Service Coverage      | Service Mix  | `OUTBOUND_MARKET_SYNC`    | No                                    |

Maintenance and Response Time are weighted heavily per operator decision —
they are the primary drivers of the automation upsell.

Threat bands (`engines/scrapeclaw/src/package-baseline.ts`):

- `score ≤ 2` → `low`
- `score ≤ 5` → `medium`
- `score > 5` → `high`

## Detection tiering

Every insight records a `detection_confidence`:

- **`observed`** — direct regex/keyword match produced the value.
- **`inferred`** — proxy signal exists (e.g. "emergency line" → after-hours
  coverage, even without a numeric SLA).
- **`absent`** — nothing on evidence pages spoke to this dimension.

When `absent`, the payload action downgrades to a safer variant
(`REQUEST_RATE_CARD` instead of `PROPOSE_PRICE_MATCH`) so the future Responder
skill cannot act on a value we never actually saw. **No fabricated numbers.**

## Client baseline (Clay County residential PM)

Hardcoded for Phase 5 in `engines/scrapeclaw/src/package-baseline.ts`:

- Management fee: **10%**
- Leasing fee: **100%**
- Maintenance coverage: **9am–5pm weekdays**
- Response SLA: **24-hour response**
- Services: tenant placement, rent collection, lease administration,
  property inspections, maintenance coordination

Replace with a real operator profile lookup when ClawOS adds multi-tenant
operator profiles.

## Database writes

- `scrapeclaw_demo_packages`: INSERT one row per run. Starts as `status='generating'`,
  promoted to `'draft'` once attachments are written. `summary_markdown`,
  `manifest` (artifact hashes + threat metadata), and `evidence_references`
  (insight → evidence anchors) are populated inline.
- `scrapeclaw_package_attachments`: INSERT exactly three rows per package
  (`csv`, `json`, `manifest`). Each carries a **logical** storage path built
  from `buildScrapeClawAttachmentPath`, plus `sha256`, `byte_size`, `row_count`.
  **No bytes are uploaded to Supabase Storage in Phase 5** — that is Phase 6.
- `scrapeclaw_prospects`: UPDATE `status='packaged'` on success.

The unique `(package_id, kind)` constraint on attachments already prevents
accidental duplicates on retry.

## Security notes

- Worker input is minimal: `{ mode: 'package', prospectId, templateSlug?, generatedAt? }`.
  The caller cannot pass the data itself — everything is reloaded under the
  caller's RLS identity. A request for another user's `prospectId` returns
  `status='failed'` with `prospect_not_found`.
- No new npm dependencies. All hashing via `node:crypto`. Keeps
  `npm audit` / Socket / Snyk clean.
- No LLM calls, no network calls — pure function.

## Boundary with Phase 6 and Phase 7

Phase 5 **stops at `status='draft'`**. The following are explicitly out of scope:

- Uploading artifact bytes to Supabase Storage (Phase 6).
- `draft` → `approved` → `queued` → `sent` state transitions (Phase 6).
- Outbound email/attachment delivery (Phase 7).
- Re-generation or run-replay UX (Phase 8).

The worker returns the artifact bytes as base64 in the result so the
operator UI can preview the package inline without a Supabase Storage
round-trip.

## Out of scope for Phase 5

- `summary_pdf` attachment kind. The `summary_markdown` column holds the
  sales copy. Adding a PDF renderer would require a new dependency (blocked
  by the dependency-review rule); deferred until a vetted, low-surface PDF
  library is approved.
- Multi-baseline support. Phase 5 assumes the residential PM wedge. A
  future baseline registry is trivial to add once a second wedge exists.

## Tests

- `engines/scrapeclaw/src/package.test.ts` — insight classification, threat
  bands, CSV shape + RFC 4180 escaping, JSON payload envelope, manifest
  self-hash verification, determinism, MD word budget.
- `apps/worker/src/skills/scrapeclaw/adapter.package.test.ts` — worker
  adapter happy path + failure modes (missing prospect / missing business),
  input validation, `generatedAt` defaulting.

Run:

```bash
# Engine tests
npm -w @clawos/scrapeclaw-engine run test

# Worker adapter tests
npm -w @clawos/worker run test
```
