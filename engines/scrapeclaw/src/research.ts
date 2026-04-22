import type {
  ScrapeClawConfidenceLevel,
  ScrapeClawContactSummary,
  ScrapeClawCompromisedPageReport,
  ScrapeClawEvidencePageKind,
  ScrapeClawQualitySummary,
  ScrapeClawQualityWarning,
  ScrapeClawResearchCandidateBusinessInput,
  ScrapeClawResearchProspectResult,
  ScrapeClawResearchWorkerInput,
  ScrapeClawResearchWorkerResult,
  ScrapeClawScoreBreakdown,
} from '@clawos/shared'
import {
  INVESTOR_TERMS,
  LISTING_TERMS,
  LOCAL_MARKET_TERMS,
  PROPERTY_MANAGEMENT_TERMS,
  SCRAPECLAW_COMPROMISED_PAGE_QUALITY_PENALTY,
  SCRAPECLAW_DEFAULT_FETCH_TIMEOUT_MS,
  SCRAPECLAW_DEFAULT_MAX_CANDIDATES,
  SCRAPECLAW_DEFAULT_MAX_PAGES_PER_BUSINESS,
  SCRAPECLAW_DEFAULT_USER_AGENT,
  SCRAPECLAW_DETERMINISTIC_SCORE_WEIGHTS,
  SCRAPECLAW_PROSPECT_QUALIFIED_THRESHOLD,
  SCRAPECLAW_SUSPICIOUS_CONTENT_TERMS,
  SCRAPECLAW_SUSPICIOUS_PAGE_MIN_TERMS,
  SCRAPECLAW_SUSPICIOUS_TITLE_MIN_LENGTH,
} from './constants.js'
import type { DnsLookupFn, PageSummary, RunScrapeClawResearchOptions } from './types.js'
import {
  collapseWhitespace,
  extractAnchors,
  extractMetaDescription,
  extractTitle,
  stripHtml,
} from './html.js'
import { buildContactSummary, type ContactExtractionPage } from './contacts.js'

const unique = <T>(values: Iterable<T>): T[] => [...new Set(values)]
const normaliseUrl = (input: string): string => new URL(input).toString()
const hostnameFor = (url: string): string | null => {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}
const sameOrigin = (a: string, b: string): boolean => hostnameFor(a) === hostnameFor(b)
function resolveUrl(baseUrl: string, href: string): string | null {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:'))
    return null
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return null
  }
}
const countTermMatches = (text: string, terms: readonly string[]): string[] =>
  unique(terms.filter((term) => text.toLowerCase().includes(term)))
const extractEmails = (text: string): string[] =>
  unique((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map((m) => m.toLowerCase()))
const extractPhones = (text: string): string[] =>
  unique(
    (text.match(/(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g) ?? []).map((m) =>
      collapseWhitespace(m),
    ),
  )
const extractSnippet = (meta: string | null, visible: string): string | null =>
  meta ? meta.slice(0, 280) : visible ? visible.slice(0, 280) : null
function classifyLink(url: string, anchorText: string): ScrapeClawEvidencePageKind {
  const combined = `${url} ${anchorText}`.toLowerCase()
  if (combined.includes('about') || combined.includes('team') || combined.includes('company'))
    return 'about'
  if (
    combined.includes('service') ||
    combined.includes('management') ||
    combined.includes('owner') ||
    combined.includes('tenant') ||
    combined.includes('leasing')
  )
    return 'services'
  if (
    combined.includes('contact') ||
    combined.includes('location') ||
    combined.includes('reach us') ||
    combined.includes('email us')
  )
    return 'contact'
  if (
    combined.includes('rental') ||
    combined.includes('listing') ||
    combined.includes('availability') ||
    combined.includes('investor')
  )
    return 'niche_relevant'
  return 'other'
}
function prioritiseLinks(
  baseUrl: string,
  html: string,
  maxPages: number,
): Array<{ pageKind: ScrapeClawEvidencePageKind; url: string }> {
  const chosen = new Map<string, ScrapeClawEvidencePageKind>()
  for (const anchor of extractAnchors(html)) {
    const resolved = resolveUrl(baseUrl, anchor.href)
    if (!resolved || !sameOrigin(baseUrl, resolved)) continue
    const kind = classifyLink(resolved, anchor.text)
    if (kind === 'other' || chosen.has(resolved)) continue
    chosen.set(resolved, kind)
  }
  const buckets: Record<ScrapeClawEvidencePageKind, string[]> = {
    homepage: [],
    about: [],
    services: [],
    contact: [],
    niche_relevant: [],
    other: [],
  }
  for (const [url, kind] of chosen) buckets[kind].push(url)
  const out: Array<{ pageKind: ScrapeClawEvidencePageKind; url: string }> = []
  const push = (kind: ScrapeClawEvidencePageKind, limit: number) => {
    for (const url of buckets[kind].slice(0, limit)) {
      if (out.length >= maxPages - 1) return
      out.push({ pageKind: kind, url })
    }
  }
  push('about', 1)
  push('services', 1)
  push('contact', 1)
  push('niche_relevant', 2)
  return out.slice(0, Math.max(0, maxPages - 1))
}
function isPrivateIpv4(a: number, b: number): boolean {
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8 private
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 shared
    a === 127 || // 127.0.0.0/8 loopback
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local (AWS metadata)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
    (a === 192 && b === 168) // 192.168.0.0/16 private
  )
}

function isSsrfSafeUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  const host = parsed.hostname
  if (host === 'localhost') return false
  // IPv4 literal
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    return !isPrivateIpv4(Number(ipv4[1]), Number(ipv4[2]))
  }
  // IPv6 literal
  if (host.startsWith('[')) {
    const ipv6 = host.slice(1, -1).toLowerCase()
    if (ipv6 === '::1') return false // loopback
    if (ipv6.startsWith('fe80:')) return false // link-local
    if (ipv6.startsWith('fc') || ipv6.startsWith('fd')) return false // unique local
    // IPv4-mapped IPv6 (::ffff:w.x.y.z) routes to the embedded IPv4 address
    if (ipv6.startsWith('::ffff:')) return false
  }
  return true
}

/** Validates a resolved DNS address (from dns.lookup) against private/reserved ranges. */
function isDnsAddressSafe(address: string, family: number): boolean {
  if (family === 6) {
    const ip = address.toLowerCase()
    if (ip === '::1') return false // loopback
    if (ip.startsWith('fe80:')) return false // link-local
    if (ip.startsWith('fc') || ip.startsWith('fd')) return false // unique local
    if (ip.startsWith('::ffff:')) return false // IPv4-mapped
    return true
  }
  // IPv4
  const m = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return true
  return !isPrivateIpv4(Number(m[1]), Number(m[2]))
}

/**
 * Async SSRF guard: runs the synchronous URL check then pre-resolves the
 * hostname via DNS and validates every returned address.
 *
 * Note: a TOCTOU gap exists between this check and the actual TCP connection.
 * VPC-level egress filtering (Lightsail security groups) is the proper
 * defense-in-depth backstop for production.
 */
async function assertSsrfSafeUrl(url: string, dnsLookupImpl: DnsLookupFn): Promise<void> {
  if (!isSsrfSafeUrl(url)) throw new Error(`Blocked unsafe URL: ${url}`)
  const { hostname } = new URL(url)
  // IP literals are already fully validated by isSsrfSafeUrl above
  if (/^[\d.]+$/.test(hostname) || hostname.startsWith('[')) return
  const records = await dnsLookupImpl(hostname)
  for (const { address, family } of records) {
    if (!isDnsAddressSafe(address, family)) {
      throw new Error(`Blocked: ${hostname} resolves to reserved address ${address}`)
    }
  }
}

async function fetchHtml(
  url: string,
  timeoutMs: number,
  userAgent: string,
  fetchImpl: typeof fetch,
  dnsLookupImpl: DnsLookupFn,
): Promise<string> {
  await assertSsrfSafeUrl(url, dnsLookupImpl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Request failed with ${response.status}`)
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}
function buildPageSummary(
  pageKind: ScrapeClawEvidencePageKind,
  url: string,
  html: string,
): PageSummary {
  const title = extractTitle(html)
  const metaDescription = extractMetaDescription(html)
  const visibleText = stripHtml(html)
  const emails = extractEmails(html)
  const phones = extractPhones(html)
  const matchedTerms = unique([
    ...countTermMatches(visibleText, PROPERTY_MANAGEMENT_TERMS),
    ...countTermMatches(visibleText, LISTING_TERMS),
    ...countTermMatches(visibleText, INVESTOR_TERMS),
  ])
  const localTerms = unique(countTermMatches(visibleText, LOCAL_MARKET_TERMS))
  // Compromised-page detection — two complementary signals, both gated on
  // matchedTerms.length === 0 to avoid penalising legitimate pages that
  // happen to mention a suspicious term in passing.
  //
  // (A) Content-term check: >= MIN distinct suspicious-content terms in the
  //     visible text. Catches known English/cross-language spam vocabulary.
  //     The "zero wedge" guard prevents false positives like a property
  //     manager whose blog mentions "casino night fundraiser" once.
  //
  // (B) Title-divergence check: a non-trivially long title (>= MIN chars)
  //     that contains zero wedge vocabulary is language-agnostic evidence
  //     of off-topic injection (e.g. Indonesian gambling spam overwriting
  //     a /contact/ page). The wedge-vocabulary check uses PM + listing +
  //     investor terms; local-market terms (city names) are intentionally
  //     excluded because geo-targeted spam sometimes includes city names.
  const suspiciousTerms = unique(countTermMatches(visibleText, SCRAPECLAW_SUSPICIOUS_CONTENT_TERMS))
  const suspiciousByTerms =
    suspiciousTerms.length >= SCRAPECLAW_SUSPICIOUS_PAGE_MIN_TERMS && matchedTerms.length === 0
  const titleLower = (title ?? '').toLowerCase()
  const titleHasWedgeVocab =
    PROPERTY_MANAGEMENT_TERMS.some((t) => titleLower.includes(t)) ||
    LISTING_TERMS.some((t) => titleLower.includes(t)) ||
    INVESTOR_TERMS.some((t) => titleLower.includes(t))
  const suspiciousByTitle =
    titleLower.length >= SCRAPECLAW_SUSPICIOUS_TITLE_MIN_LENGTH &&
    !titleHasWedgeVocab &&
    matchedTerms.length === 0
  const suspicious = suspiciousByTerms || suspiciousByTitle
  return {
    url,
    pageKind,
    title,
    snippet: extractSnippet(metaDescription, visibleText),
    visibleText,
    emails,
    phones,
    matchedTerms,
    localTerms,
    suspiciousTerms,
    suspicious,
    extractedFacts: {
      title,
      metaDescription,
      emails,
      phones,
      matchedTerms,
      localTerms,
      suspiciousTerms,
      suspicious,
      containsPropertyManagementSignals:
        countTermMatches(visibleText, PROPERTY_MANAGEMENT_TERMS).length > 0,
      containsRentalListingSignals: countTermMatches(visibleText, LISTING_TERMS).length > 0,
      containsInvestorSignals: countTermMatches(visibleText, INVESTOR_TERMS).length > 0,
    },
  }
}
function confidenceFromEvidence(evidence: PageSummary[]): ScrapeClawConfidenceLevel {
  const strongPages = evidence.filter((item) => item.matchedTerms.length >= 2).length
  const hasCompromised = evidence.some((item) => item.suspicious)
  // Cap confidence at "low" when any page is flagged compromised — the
  // research pass is the right place to be conservative even if signal
  // counts otherwise looked strong.
  if (hasCompromised) return 'low'
  if (evidence.length >= 4 && strongPages >= 2) return 'high'
  if (evidence.length >= 2 && strongPages >= 1) return 'medium'
  return 'low'
}
// ── Phase 4a — Decomposed deterministic scoring ───────────────────────────────
//
// Replaces the old single-number computeFitScore. Each sub-score is bounded
// to [0, 1] before weighting; the weighted final score is also clamped.
//
// Wedge-keyed weights live in constants. When a second wedge lands the
// vocabulary lists (PROPERTY_MANAGEMENT_TERMS etc.) and weights become
// per-wedge — see the WedgeProfile note in constants.
//
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function round4(n: number): number {
  return Number(n.toFixed(4))
}

/**
 * Wedge match: distinct property-management vocabulary terms across all
 * pages, normalized so 4+ distinct terms fully saturate the sub-score.
 */
function subscoreWedgeMatch(evidence: PageSummary[]): number {
  const distinct = unique(
    evidence.flatMap((page) =>
      page.matchedTerms.filter((term) => PROPERTY_MANAGEMENT_TERMS.includes(term as never)),
    ),
  )
  return clamp01(distinct.length / 4)
}

function subscoreInventorySignal(evidence: PageSummary[]): number {
  const listing = unique(
    evidence.flatMap((page) =>
      page.matchedTerms.filter((term) => LISTING_TERMS.includes(term as never)),
    ),
  )
  const investor = unique(
    evidence.flatMap((page) =>
      page.matchedTerms.filter((term) => INVESTOR_TERMS.includes(term as never)),
    ),
  )
  // Listings are the primary inventory signal; investor terms add half-weight.
  return clamp01(listing.length / 3 + investor.length / 6)
}

function subscoreLocality(
  candidate: ScrapeClawResearchCandidateBusinessInput,
  evidence: PageSummary[],
): number {
  const distinctLocal = unique(evidence.flatMap((page) => page.localTerms))
  const candidateLocality = candidate.city || candidate.state || candidate.serviceAreaText ? 1 : 0
  return clamp01(distinctLocal.length / 3 + candidateLocality * 0.4)
}

/**
 * Website quality: penalize when no non-homepage page returned evidence,
 * and lower further when any page is flagged compromised.
 */
function subscoreWebsiteQuality(evidence: PageSummary[]): number {
  let score = 0.5 // baseline for "homepage fetched"
  const kinds = new Set(evidence.map((p) => p.pageKind))
  if (kinds.has('about')) score += 0.1
  if (kinds.has('services')) score += 0.15
  if (kinds.has('contact')) score += 0.15
  if (kinds.has('niche_relevant')) score += 0.1
  const hasCompromised = evidence.some((p) => p.suspicious)
  if (hasCompromised) {
    score *= SCRAPECLAW_COMPROMISED_PAGE_QUALITY_PENALTY
  }
  return clamp01(score)
}

/** Map ScrapeClawContactSummary.contactConfidence to a 0–1 score. */
function subscoreContactQuality(contacts: ScrapeClawContactSummary): number {
  switch (contacts.contactConfidence) {
    case 'high':
      return 1
    case 'medium':
      return 0.6
    case 'low':
      return contacts.primaryBusinessEmail || contacts.primaryBusinessPhone ? 0.3 : 0
  }
}

/**
 * Evidence richness: how many distinct, signal-bearing pages contributed.
 * Saturates at 4 distinct pages with at least one matched term each.
 */
function subscoreEvidenceRichness(evidence: PageSummary[]): number {
  const distinctSignalPages = new Set(
    evidence.filter((p) => p.matchedTerms.length > 0).map((p) => p.url),
  )
  return clamp01(distinctSignalPages.size / 4)
}

function buildScoreRationale(args: {
  breakdown: ScrapeClawScoreBreakdown
  wedgeMatchCount: number
  inventoryMatchCount: number
  localTermCount: number
  contactConfidence: ScrapeClawConfidenceLevel
  distinctEvidencePages: number
  hasCompromised: boolean
}): string[] {
  const r: string[] = [
    `Final deterministic score: ${args.breakdown.finalScore.toFixed(3)}`,
    `Wedge match (${args.wedgeMatchCount} distinct terms): +${args.breakdown.wedgeMatchScore.toFixed(3)}`,
    `Inventory signals (${args.inventoryMatchCount} listing/investor terms): +${args.breakdown.inventorySignalScore.toFixed(3)}`,
    `Locality (${args.localTermCount} local terms + candidate metadata): +${args.breakdown.localityScore.toFixed(3)}`,
    `Website quality (${args.distinctEvidencePages} distinct pages): +${args.breakdown.websiteQualityScore.toFixed(3)}`,
    `Contact quality (confidence: ${args.contactConfidence}): +${args.breakdown.contactQualityScore.toFixed(3)}`,
    `Evidence richness: +${args.breakdown.evidenceRichnessScore.toFixed(3)}`,
  ]
  if (args.hasCompromised) {
    r.push('Compromised page(s) detected — websiteQualityScore reduced.')
  }
  return r
}

function computeScoreBreakdown(
  candidate: ScrapeClawResearchCandidateBusinessInput,
  evidence: PageSummary[],
  contacts: ScrapeClawContactSummary,
): ScrapeClawScoreBreakdown {
  const W = SCRAPECLAW_DETERMINISTIC_SCORE_WEIGHTS
  const wedgeRaw = subscoreWedgeMatch(evidence)
  const inventoryRaw = subscoreInventorySignal(evidence)
  const localityRaw = subscoreLocality(candidate, evidence)
  const websiteRaw = subscoreWebsiteQuality(evidence)
  const contactRaw = subscoreContactQuality(contacts)
  const evidenceRaw = subscoreEvidenceRichness(evidence)

  const wedgeMatchScore = round4(wedgeRaw * W.wedgeMatch)
  const inventorySignalScore = round4(inventoryRaw * W.inventorySignal)
  const localityScore = round4(localityRaw * W.locality)
  const websiteQualityScore = round4(websiteRaw * W.websiteQuality)
  const contactQualityScore = round4(contactRaw * W.contactQuality)
  const evidenceRichnessScore = round4(evidenceRaw * W.evidenceRichness)

  const finalScore = round4(
    clamp01(
      wedgeMatchScore +
        inventorySignalScore +
        localityScore +
        websiteQualityScore +
        contactQualityScore +
        evidenceRichnessScore,
    ),
  )

  const breakdown: ScrapeClawScoreBreakdown = {
    wedgeMatchScore,
    inventorySignalScore,
    localityScore,
    websiteQualityScore,
    contactQualityScore,
    evidenceRichnessScore,
    finalScore,
    rationale: [],
  }
  breakdown.rationale = buildScoreRationale({
    breakdown,
    wedgeMatchCount: unique(
      evidence.flatMap((p) =>
        p.matchedTerms.filter((t) => PROPERTY_MANAGEMENT_TERMS.includes(t as never)),
      ),
    ).length,
    inventoryMatchCount: unique(
      evidence.flatMap((p) =>
        p.matchedTerms.filter(
          (t) => LISTING_TERMS.includes(t as never) || INVESTOR_TERMS.includes(t as never),
        ),
      ),
    ).length,
    localTermCount: unique(evidence.flatMap((p) => p.localTerms)).length,
    contactConfidence: contacts.contactConfidence,
    distinctEvidencePages: new Set(evidence.map((p) => p.url)).size,
    hasCompromised: evidence.some((p) => p.suspicious),
  })
  return breakdown
}

/**
 * Build the per-prospect quality summary: distinct evidence pages,
 * compromised page reports, and coarse warnings for UI.
 */
function buildQualitySummary(evidence: PageSummary[]): ScrapeClawQualitySummary {
  const distinctUrls = new Set(evidence.map((p) => p.url))
  const distinctEvidencePageCount = distinctUrls.size
  const homepageOnly = distinctEvidencePageCount === 1 && evidence[0]?.pageKind === 'homepage'

  const compromisedPages: ScrapeClawCompromisedPageReport[] = evidence
    .filter((p) => p.suspicious)
    .map((p) => ({
      url: p.url,
      matchedTerms: p.suspiciousTerms ?? [],
      hasNoWedgeSignal: p.matchedTerms.length === 0,
    }))

  const warnings: ScrapeClawQualityWarning[] = []
  if (compromisedPages.length > 0) warnings.push('compromised_page_detected')
  if (distinctEvidencePageCount <= 1) warnings.push('homepage_only')
  if (
    distinctEvidencePageCount < 3 ||
    evidence.filter((p) => p.matchedTerms.length > 0).length < 2
  ) {
    warnings.push('thin_evidence')
  }

  return {
    distinctEvidencePageCount,
    homepageOnly,
    compromisedPages,
    warnings,
  }
}

// Old single-number scorer removed in Phase 4a. Final score now lives on
// scoreBreakdown.finalScore from computeScoreBreakdown above. The threshold
// for qualified/disqualified is SCRAPECLAW_PROSPECT_QUALIFIED_THRESHOLD.
function buildUseCaseHypothesis(evidence: PageSummary[]): string {
  const text = evidence.map((item) => item.visibleText.toLowerCase()).join(' ')
  if (countTermMatches(text, PROPERTY_MANAGEMENT_TERMS).length >= 2)
    return 'Track competitor rental listings and availability changes across local property managers.'
  if (countTermMatches(text, LISTING_TERMS).length >= 2)
    return 'Build a fresh local rental inventory sheet with listing status and availability updates.'
  return 'Monitor public property and rental pages for structured local market snapshots.'
}
function buildDataNeedHypothesis(evidence: PageSummary[]): string {
  const withListings = evidence.some((item) =>
    item.matchedTerms.some((term) => LISTING_TERMS.includes(term as never)),
  )
  return withListings
    ? 'This prospect exposes public listing or availability data across multiple pages, making recurring structured extraction valuable.'
    : 'This prospect publishes public market-facing information that benefits from clean, repeatable extraction and monitoring.'
}
function buildDemoTypeRecommendation(evidence: PageSummary[]): string {
  const terms = unique(evidence.flatMap((item) => item.matchedTerms))
  if (terms.some((term) => LISTING_TERMS.includes(term as never)))
    return 'rental_inventory_snapshot'
  if (terms.some((term) => INVESTOR_TERMS.includes(term as never))) return 'local_market_snapshot'
  return 'competitor_listing_feed'
}
function buildOutreachAngle(
  candidate: ScrapeClawResearchCandidateBusinessInput,
  evidence: PageSummary[],
): string {
  const localTerms = unique(evidence.flatMap((item) => item.localTerms))
  const locality =
    candidate.city ??
    (localTerms[0] ? localTerms[0].replace(/\b\w/g, (ch) => ch.toUpperCase()) : 'the local market')
  return `Show how a recurring sheet for ${locality} listings and availability changes could save ${candidate.name} manual monitoring time.`
}
function buildReasoning(
  candidate: ScrapeClawResearchCandidateBusinessInput,
  evidence: PageSummary[],
): string[] {
  const pageKinds = unique(evidence.map((item) => item.pageKind))
  const terms = unique(evidence.flatMap((item) => item.matchedTerms)).slice(0, 5)
  const reasons = [
    `${candidate.name} exposes ${pageKinds.join(', ')} pages that can be monitored without login requirements.`,
  ]
  if (terms.length > 0) reasons.push(`Observed signals: ${terms.join(', ')}.`)
  const localTerms = unique(evidence.flatMap((item) => item.localTerms))
  if (localTerms.length > 0)
    reasons.push(`Local market references found: ${localTerms.slice(0, 3).join(', ')}.`)
  return reasons
}
const prospectStatusFromScore = (score: number): 'qualified' | 'disqualified' =>
  score >= SCRAPECLAW_PROSPECT_QUALIFIED_THRESHOLD ? 'qualified' : 'disqualified'
async function researchCandidate(
  candidate: ScrapeClawResearchCandidateBusinessInput,
  input: ScrapeClawResearchWorkerInput,
  fetchImpl: typeof fetch,
  dnsLookupImpl: DnsLookupFn,
): Promise<ScrapeClawResearchProspectResult> {
  const timeoutMs = input.fetchTimeoutMs ?? SCRAPECLAW_DEFAULT_FETCH_TIMEOUT_MS
  const maxPages = input.maxPagesPerBusiness ?? SCRAPECLAW_DEFAULT_MAX_PAGES_PER_BUSINESS
  const userAgent = input.userAgent ?? SCRAPECLAW_DEFAULT_USER_AGENT
  const websiteUrl = normaliseUrl(candidate.canonicalWebsiteUrl)
  const homepageHtml = await fetchHtml(websiteUrl, timeoutMs, userAgent, fetchImpl, dnsLookupImpl)
  const nowIso = new Date().toISOString()
  const evidencePages: PageSummary[] = [buildPageSummary('homepage', websiteUrl, homepageHtml)]
  for (const nextPage of prioritiseLinks(websiteUrl, homepageHtml, maxPages)) {
    try {
      evidencePages.push(
        buildPageSummary(
          nextPage.pageKind,
          nextPage.url,
          await fetchHtml(nextPage.url, timeoutMs, userAgent, fetchImpl, dnsLookupImpl),
        ),
      )
    } catch {
      /* empty */
    }
  }

  // Phase 4a: build contact summary across all pages, then derive the
  // decomposed score breakdown and quality summary.
  const contactPages: ContactExtractionPage[] = evidencePages.map((p) => ({
    pageKind: p.pageKind,
    visibleText: p.visibleText,
  }))
  const contactSummary = buildContactSummary(contactPages, websiteUrl)
  const scoreBreakdown = computeScoreBreakdown(candidate, evidencePages, contactSummary)
  const qualitySummary = buildQualitySummary(evidencePages)

  const fitScore = scoreBreakdown.finalScore
  // confidenceLevel respects compromised-page detection; status uses the
  // shared qualified threshold.
  let confidenceLevel = confidenceFromEvidence(evidencePages)
  // If contacts came in clean and rich, allow a one-step bump within bounds.
  if (
    confidenceLevel === 'medium' &&
    contactSummary.contactConfidence === 'high' &&
    qualitySummary.compromisedPages.length === 0
  ) {
    confidenceLevel = 'high'
  }

  return {
    business: candidate,
    prospect: {
      status: prospectStatusFromScore(fitScore),
      wedgeSlug: input.wedgeSlug,
      marketCity: input.marketCity,
      marketRegion: input.marketRegion,
      fitScore,
      useCaseHypothesis: buildUseCaseHypothesis(evidencePages),
      dataNeedHypothesis: buildDataNeedHypothesis(evidencePages),
      demoTypeRecommendation: buildDemoTypeRecommendation(evidencePages),
      outreachAngle: buildOutreachAngle(candidate, evidencePages),
      confidenceLevel,
    },
    evidenceItems: evidencePages.map((page) => ({
      pageKind: page.pageKind,
      sourceUrl: page.url,
      observedAt: nowIso,
      title: page.title,
      snippet: page.snippet,
      extractedFacts: page.extractedFacts,
      sourceConfidence: page.suspicious ? 'low' : confidenceLevel,
    })),
    reasoning: buildReasoning(candidate, evidencePages),
    scoreBreakdown,
    contactSummary,
    qualitySummary,
  }
}
export async function runScrapeClawAgent1Research(
  input: ScrapeClawResearchWorkerInput,
  options: RunScrapeClawResearchOptions = {},
): Promise<ScrapeClawResearchWorkerResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (!fetchImpl) throw new Error('Global fetch is not available in this runtime')
  const dnsLookupImpl: DnsLookupFn =
    options.dnsLookupImpl ??
    (async (hostname) => {
      const { lookup } = await import('node:dns/promises')
      return lookup(hostname, { all: true })
    })
  const rankedProspects: ScrapeClawResearchProspectResult[] = []
  const discardedBusinesses: ScrapeClawResearchWorkerResult['discardedBusinesses'] = []
  for (const candidate of input.candidates.slice(
    0,
    input.maxCandidates ?? SCRAPECLAW_DEFAULT_MAX_CANDIDATES,
  )) {
    try {
      rankedProspects.push(await researchCandidate(candidate, input, fetchImpl, dnsLookupImpl))
    } catch (error) {
      discardedBusinesses.push({
        business: candidate,
        reason: error instanceof Error ? error.message : 'Failed to fetch candidate pages',
      })
    }
  }
  rankedProspects.sort((a, b) => b.prospect.fitScore - a.prospect.fitScore)
  return {
    mode: 'research',
    wedgeSlug: input.wedgeSlug,
    marketCity: input.marketCity,
    marketRegion: input.marketRegion,
    generatedAt: new Date().toISOString(),
    rankedProspects,
    discardedBusinesses,
  }
}
