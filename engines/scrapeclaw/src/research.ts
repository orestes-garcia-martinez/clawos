import type {
  ScrapeClawConfidenceLevel,
  ScrapeClawEvidencePageKind,
  ScrapeClawResearchCandidateBusinessInput,
  ScrapeClawResearchProspectResult,
  ScrapeClawResearchWorkerInput,
  ScrapeClawResearchWorkerResult,
} from '@clawos/shared'
import {
  INVESTOR_TERMS,
  LISTING_TERMS,
  LOCAL_MARKET_TERMS,
  PROPERTY_MANAGEMENT_TERMS,
  SCRAPECLAW_DEFAULT_FETCH_TIMEOUT_MS,
  SCRAPECLAW_DEFAULT_MAX_CANDIDATES,
  SCRAPECLAW_DEFAULT_MAX_PAGES_PER_BUSINESS,
  SCRAPECLAW_DEFAULT_USER_AGENT,
} from './constants.js'
import type { DnsLookupFn, PageSummary, RunScrapeClawResearchOptions } from './types.js'
import {
  collapseWhitespace,
  extractAnchors,
  extractMetaDescription,
  extractTitle,
  stripHtml,
} from './html.js'

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
    extractedFacts: {
      title,
      metaDescription,
      emails,
      phones,
      matchedTerms,
      localTerms,
      containsPropertyManagementSignals:
        countTermMatches(visibleText, PROPERTY_MANAGEMENT_TERMS).length > 0,
      containsRentalListingSignals: countTermMatches(visibleText, LISTING_TERMS).length > 0,
      containsInvestorSignals: countTermMatches(visibleText, INVESTOR_TERMS).length > 0,
    },
  }
}
function confidenceFromEvidence(evidence: PageSummary[]): ScrapeClawConfidenceLevel {
  const strongPages = evidence.filter((item) => item.matchedTerms.length >= 2).length
  if (evidence.length >= 4 && strongPages >= 2) return 'high'
  if (evidence.length >= 2 && strongPages >= 1) return 'medium'
  return 'low'
}
// TODO: scoring weights below are tuned for the residential_property_management wedge only.
// When adding new wedge slugs, branch on wedgeSlug and apply appropriate term weights.
function computeFitScore(
  candidate: ScrapeClawResearchCandidateBusinessInput,
  evidence: PageSummary[],
): number {
  const joinedTerms = unique(evidence.flatMap((item) => item.matchedTerms))
  const localTerms = unique(evidence.flatMap((item) => item.localTerms))
  const emails = evidence.flatMap((item) => item.emails)
  const phones = evidence.flatMap((item) => item.phones)
  let score = 0
  score += Math.min(
    joinedTerms.filter((term) => PROPERTY_MANAGEMENT_TERMS.includes(term as never)).length * 0.12,
    0.42,
  )
  score += Math.min(
    joinedTerms.filter((term) => LISTING_TERMS.includes(term as never)).length * 0.1,
    0.2,
  )
  score += Math.min(
    joinedTerms.filter((term) => INVESTOR_TERMS.includes(term as never)).length * 0.08,
    0.16,
  )
  if (localTerms.length > 0 || candidate.city || candidate.state || candidate.serviceAreaText)
    score += 0.12
  if (emails.length > 0 || phones.length > 0) score += 0.05
  if (evidence.some((item) => item.pageKind === 'services')) score += 0.05
  if (evidence.some((item) => item.pageKind === 'contact')) score += 0.05
  return Number(Math.max(0, Math.min(1, score)).toFixed(4))
}
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
  score >= 0.35 ? 'qualified' : 'disqualified'
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
  const fitScore = computeFitScore(candidate, evidencePages)
  const confidenceLevel = confidenceFromEvidence(evidencePages)
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
      sourceConfidence: confidenceLevel,
    })),
    reasoning: buildReasoning(candidate, evidencePages),
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
    wedgeSlug: input.wedgeSlug,
    marketCity: input.marketCity,
    marketRegion: input.marketRegion,
    generatedAt: new Date().toISOString(),
    rankedProspects,
    discardedBusinesses,
  }
}
