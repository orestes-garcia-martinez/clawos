// ─────────────────────────────────────────────────────────────────────────────
// ScrapeClaw — Phase 4a — URL eligibility & normalization.
//
// This module decides whether a URL is safe and well-formed enough to spend
// research budget on, BEFORE pre-rank or research selection. It is purely
// synchronous (no DNS), because:
//
//   - Pre-rank runs over many candidates; per-candidate DNS would be wasteful.
//   - The async DNS-aware SSRF guard in research.ts (`assertSsrfSafeUrl`)
//     remains the authoritative defense at fetch time.
//
// Normalization rules:
//   - Trim, lowercase hostname, strip leading "www.", drop fragments/queries.
//   - Collapse trailing-slash variants on the root path.
//   - Attempt safe http→https upgrade. We only emit https-normalized URLs;
//     downstream fetches confirm via TLS that the host actually serves https.
//
// Rejection reasons match `ScrapeClawUrlIneligibilityReason`.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ScrapeClawUrlEligibilityResult,
  ScrapeClawUrlIneligibilityReason,
} from '@clawos/shared'

function build(
  originalUrl: string,
  reason: ScrapeClawUrlIneligibilityReason,
  rationale: string,
): ScrapeClawUrlEligibilityResult {
  return { eligible: false, originalUrl, normalizedUrl: null, reason, rationale }
}

function buildOk(originalUrl: string, normalizedUrl: string): ScrapeClawUrlEligibilityResult {
  return { eligible: true, originalUrl, normalizedUrl, reason: null, rationale: null }
}

/**
 * Synchronous IP-literal screen. Mirrors the private/reserved range list in
 * research.ts but kept local so url-eligibility has no dependency on the
 * research module.
 */
function isPrivateIpv4(a: number, b: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

function isHostUnsafe(host: string): boolean {
  if (host === 'localhost' || host === '0.0.0.0') return true

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    return isPrivateIpv4(Number(ipv4[1]), Number(ipv4[2]))
  }

  if (host.startsWith('[')) {
    const ipv6 = host.slice(1, -1).toLowerCase()
    if (ipv6 === '::1') return true
    if (ipv6.startsWith('fe80:')) return true
    if (ipv6.startsWith('fc') || ipv6.startsWith('fd')) return true
    if (ipv6.startsWith('::ffff:')) return true
  }

  return false
}

/**
 * Hostnames we never want to research, even if they parse cleanly. Aimed at
 * social media profile URLs and Google-owned redirectors that occasionally
 * leak through Place Details.
 */
const FORBIDDEN_HOST_SUFFIXES = [
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'pinterest.com',
  'youtube.com',
  'tiktok.com',
  'goo.gl',
  'g.co',
] as const

function isForbiddenHostPattern(host: string): boolean {
  return FORBIDDEN_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

/**
 * Normalize a website URL and decide whether it is eligible for research.
 *
 * Idempotent: passing an already-normalized URL returns the same value.
 */
export function evaluateUrlEligibility(input: string): ScrapeClawUrlEligibilityResult {
  const trimmed = input?.trim?.() ?? ''
  if (!trimmed) {
    return build(input ?? '', 'malformed_url', 'Empty URL')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return build(trimmed, 'malformed_url', 'Could not parse as URL')
  }

  // Reject anything that is not http(s). We never research javascript:, data:,
  // mailto:, tel:, or ftp:.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return build(trimmed, 'unsupported_scheme', `Unsupported scheme: ${parsed.protocol}`)
  }

  if (!parsed.hostname) {
    return build(trimmed, 'empty_host', 'URL has no host')
  }

  // Lowercase hostname, strip leading "www.".
  const lowerHost = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (isHostUnsafe(lowerHost)) {
    return build(trimmed, 'private_or_loopback_host', `Blocked host: ${lowerHost}`)
  }

  if (isForbiddenHostPattern(lowerHost)) {
    return build(trimmed, 'forbidden_host_pattern', `Forbidden host: ${lowerHost}`)
  }

  // Build the normalized form: https, lowercased host, no fragment/query,
  // collapsed trailing slash for root paths.
  const normalized = new URL(trimmed)
  normalized.protocol = 'https:'
  normalized.hostname = lowerHost
  normalized.hash = ''
  normalized.search = ''
  if (normalized.pathname === '' || normalized.pathname === '/') {
    normalized.pathname = '/'
  } else {
    normalized.pathname = normalized.pathname.replace(/\/+$/, '') || '/'
  }
  // Strip default ports (e.g. https://example.com:443/).
  if (
    (normalized.protocol === 'https:' && normalized.port === '443') ||
    (normalized.protocol === 'http:' && normalized.port === '80')
  ) {
    normalized.port = ''
  }

  return buildOk(trimmed, normalized.toString())
}
