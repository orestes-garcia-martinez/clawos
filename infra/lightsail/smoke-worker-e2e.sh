#!/usr/bin/env bash
# smoke-worker-e2e.sh — Post-deploy smoke tests for the ClawOS Lightsail worker.
#
# Verifies each route is reachable, auth is enforced, and schema validation fires.
# Does NOT make real skill invocations (those require signed assertions from the API).
#
# Usage: bash infra/lightsail/smoke-worker-e2e.sh
# Run from the Lightsail instance or any host with curl + jq installed.

set -euo pipefail

WORKER_URL="${WORKER_URL:-http://localhost:3002}"
SECRET=$(grep '^WORKER_SECRET=' ~/clawos/apps/worker/.env | cut -d= -f2)

if [[ -z "$SECRET" ]]; then
  echo "ERROR: WORKER_SECRET not found in ~/clawos/apps/worker/.env" >&2
  exit 1
fi

PASS=0
FAIL=0

check() {
  local label="$1"
  local expected_status="$2"
  local actual_status="$3"
  if [[ "$actual_status" == "$expected_status" ]]; then
    echo "  PASS  $label (HTTP $actual_status)"
    ((PASS++)) || true
  else
    echo "  FAIL  $label (expected HTTP $expected_status, got $actual_status)"
    ((FAIL++)) || true
  fi
}

echo "=== ClawOS Worker Smoke Tests ==="
echo "Target: $WORKER_URL"
echo ""

# ── Health ────────────────────────────────────────────────────────────────────

echo "--- /health"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL/health")
check "GET /health returns 200" "200" "$STATUS"

# ── Auth enforcement ──────────────────────────────────────────────────────────

echo ""
echo "--- Auth enforcement (no x-worker-secret)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WORKER_URL/run/careerclaw" \
  -H "Content-Type: application/json" -d '{}')
check "POST /run/careerclaw without secret returns 401" "401" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WORKER_URL/run/careerclaw/gap-analysis" \
  -H "Content-Type: application/json" -d '{}')
check "POST /run/careerclaw/gap-analysis without secret returns 401" "401" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WORKER_URL/run/careerclaw/cover-letter" \
  -H "Content-Type: application/json" -d '{}')
check "POST /run/careerclaw/cover-letter without secret returns 401" "401" "$STATUS"

# ── Schema validation ─────────────────────────────────────────────────────────
#
# With a valid worker secret but empty body, schema validation fires before
# assertion verification — each route should return 400.

echo ""
echo "--- Schema validation (valid secret, empty body)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WORKER_URL/run/careerclaw" \
  -H "Content-Type: application/json" \
  -H "x-worker-secret: $SECRET" \
  -d '{}')
check "POST /run/careerclaw with empty body returns 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WORKER_URL/run/careerclaw/gap-analysis" \
  -H "Content-Type: application/json" \
  -H "x-worker-secret: $SECRET" \
  -d '{}')
check "POST /run/careerclaw/gap-analysis with empty body returns 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WORKER_URL/run/careerclaw/cover-letter" \
  -H "Content-Type: application/json" \
  -H "x-worker-secret: $SECRET" \
  -d '{}')
check "POST /run/careerclaw/cover-letter with empty body returns 400" "400" "$STATUS"

# ── Assertion verification ────────────────────────────────────────────────────
#
# With a valid worker secret + schema-valid body but a bogus assertion token,
# signature verification fails and the worker returns 403.

echo ""
echo "--- Assertion verification (valid secret + schema, invalid assertion)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WORKER_URL/run/careerclaw" \
  -H "Content-Type: application/json" \
  -H "x-worker-secret: $SECRET" \
  -d '{
    "assertion": "this-is-not-a-valid-signed-token-aaaaaaaaaaaaa",
    "input": {
      "profile": { "skills": ["TypeScript"] },
      "topK": 3
    }
  }')
check "POST /run/careerclaw with invalid assertion returns 403" "403" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WORKER_URL/run/careerclaw/gap-analysis" \
  -H "Content-Type: application/json" \
  -H "x-worker-secret: $SECRET" \
  -d '{
    "assertion": "this-is-not-a-valid-signed-token-aaaaaaaaaaaaa",
    "input": {
      "match": {
        "job": {
          "job_id": "smoke-job-1", "title": "Engineer", "company": "Acme",
          "location": "Remote", "description": "Test", "url": "https://acme.com",
          "source": "test", "salary_min": null, "salary_max": null,
          "work_mode": null, "experience_years": null,
          "posted_at": null, "fetched_at": "2026-01-01T00:00:00Z"
        },
        "score": 0.8,
        "breakdown": {},
        "matched_keywords": [],
        "gap_keywords": []
      },
      "resumeIntel": {
        "extracted_keywords": [], "extracted_phrases": [],
        "keyword_stream": [], "phrase_stream": [],
        "impact_signals": [], "keyword_weights": {},
        "phrase_weights": {}, "source": "skills_injected"
      }
    }
  }')
check "POST /run/careerclaw/gap-analysis with invalid assertion returns 403" "403" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WORKER_URL/run/careerclaw/cover-letter" \
  -H "Content-Type: application/json" \
  -H "x-worker-secret: $SECRET" \
  -d '{
    "assertion": "this-is-not-a-valid-signed-token-aaaaaaaaaaaaa",
    "input": {
      "match": {
        "job": {
          "job_id": "smoke-job-1", "title": "Engineer", "company": "Acme",
          "location": "Remote", "description": "Test", "url": "https://acme.com",
          "source": "test", "salary_min": null, "salary_max": null,
          "work_mode": null, "experience_years": null,
          "posted_at": null, "fetched_at": "2026-01-01T00:00:00Z"
        },
        "score": 0.8,
        "breakdown": {},
        "matched_keywords": [],
        "gap_keywords": []
      },
      "profile": { "skills": ["TypeScript"] },
      "resumeIntel": {
        "extracted_keywords": [], "extracted_phrases": [],
        "keyword_stream": [], "phrase_stream": [],
        "impact_signals": [], "keyword_weights": {},
        "phrase_weights": {}, "source": "skills_injected"
      }
    }
  }')
check "POST /run/careerclaw/cover-letter with invalid assertion returns 403" "403" "$STATUS"

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
