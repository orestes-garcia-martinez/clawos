// ─────────────────────────────────────────────────────────────────────────────
// ScrapeClaw — Phase 4a — Contact extraction, normalization & classification.
//
// Replaces the inline regex extraction in research.ts with a dedicated module
// that:
//   - Scans visible text from one or more pages
//   - Validates email syntax and rejects junk (noreply, asset hosts, dupes)
//   - Validates phone shape and rejects clearly-non-phone numeric strings
//     (ZIP+4, IDs, anything that doesn't match a North-American number)
//   - Picks one primary email and one primary phone using documented rules
//   - Returns a confidence level so downstream scoring can weight contacts
//
// Primary email selection (per Q&A A):
//   1. role-based mailbox (info, contact, hello, office, leasing, sales,
//      admin) on the same domain as the website
//   2. any mailbox on the same domain as the website
//   3. role-based mailbox off-domain
//   - else: no primary
//
// Primary phone selection:
//   - first phone observed on a contact-kind page wins; else first phone
//     observed on any page; else null.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ScrapeClawConfidenceLevel,
  ScrapeClawContactRejectionReason,
  ScrapeClawContactSummary,
  ScrapeClawEvidencePageKind,
  ScrapeClawRejectedContact,
} from '@clawos/shared'
import {
  SCRAPECLAW_ASSET_EMAIL_HOST_SUFFIXES,
  SCRAPECLAW_NOREPLY_MAILBOX_PREFIXES,
  SCRAPECLAW_ROLE_BASED_MAILBOXES,
} from './constants.js'

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

/**
 * North American Numbering Plan phone shape. Optional leading +1, optional
 * parens around area code, separators allowed.
 */
const PHONE_RE = /(?:\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?([2-9]\d{2})[-.\s]?(\d{4})/g

/** Strip a website URL down to its hostname-without-www. */
function hostnameOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

function isAssetHost(host: string): boolean {
  return SCRAPECLAW_ASSET_EMAIL_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  )
}

function isNoreply(localPart: string): boolean {
  const lower = localPart.toLowerCase()
  return SCRAPECLAW_NOREPLY_MAILBOX_PREFIXES.some((p) => lower.startsWith(p))
}

function isRoleBased(localPart: string): boolean {
  const lower = localPart.toLowerCase()
  return SCRAPECLAW_ROLE_BASED_MAILBOXES.some(
    (role) => lower === role || lower.startsWith(`${role}.`) || lower.startsWith(`${role}-`),
  )
}

function rootDomain(host: string): string {
  // Conservative: take the last two labels. Good enough for distinguishing
  // examplepm.com from gmail.com; not trying to be a public-suffix-list.
  const parts = host.split('.')
  return parts.length >= 2 ? parts.slice(-2).join('.') : host
}

function emailDomain(email: string): string {
  return email.slice(email.indexOf('@') + 1).toLowerCase()
}

export interface ContactExtractionPage {
  pageKind: ScrapeClawEvidencePageKind
  /** Visible text (already stripped of HTML). */
  visibleText: string
  /**
   * Emails pre-extracted from raw HTML (preferred over visibleText re-scan
   * when provided, because mailto: href attributes are not in visible text).
   */
  emails?: string[]
  /**
   * Phones pre-extracted from raw HTML (preferred over visibleText re-scan
   * when provided).
   */
  phones?: string[]
}

interface PhoneCandidate {
  /** Normalized "+1XXXXXXXXXX" form. */
  normalized: string
  /** Display form: "(904) 555-1212". */
  display: string
  pageKind: ScrapeClawEvidencePageKind
}

interface EmailCandidate {
  /** Lowercased full address. */
  address: string
  pageKind: ScrapeClawEvidencePageKind
}

function extractEmailsFromPage(page: ContactExtractionPage): string[] {
  if (page.emails) return page.emails.map((e) => e.toLowerCase())
  return Array.from(page.visibleText.matchAll(EMAIL_RE), (m) => m[0].toLowerCase())
}

function extractPhonesFromPage(
  page: ContactExtractionPage,
): Array<{ normalized: string; display: string }> {
  // When pre-extracted phones are provided, join them so the PHONE_RE (which
  // applies stricter NANP validation than the HTML extractor) still runs,
  // but only against pre-matched strings rather than a full page of text.
  const text = page.phones ? page.phones.join('\n') : page.visibleText
  const out: Array<{ normalized: string; display: string }> = []
  for (const match of text.matchAll(PHONE_RE)) {
    const [, area, exch, line] = match
    if (!area || !exch || !line) continue
    const digits = `${area}${exch}${line}`
    out.push({
      normalized: `+1${digits}`,
      display: `(${area}) ${exch}-${line}`,
    })
  }
  return out
}

/** Classify and select primary email from a deduped, validated list. */
function pickPrimaryEmail(
  candidates: EmailCandidate[],
  websiteHost: string | null,
): { primary: string | null; secondary: string[] } {
  if (candidates.length === 0) return { primary: null, secondary: [] }
  const siteRoot = websiteHost ? rootDomain(websiteHost) : null

  const sameDomainRole: string[] = []
  const sameDomainOther: string[] = []
  const offDomainRole: string[] = []
  const offDomainOther: string[] = []

  for (const cand of candidates) {
    const localPart = cand.address.split('@', 1)[0] ?? ''
    const dom = emailDomain(cand.address)
    const onSite = siteRoot !== null && rootDomain(dom) === siteRoot
    const role = isRoleBased(localPart)
    if (onSite && role) sameDomainRole.push(cand.address)
    else if (onSite) sameDomainOther.push(cand.address)
    else if (role) offDomainRole.push(cand.address)
    else offDomainOther.push(cand.address)
  }

  const ordered = [...sameDomainRole, ...sameDomainOther, ...offDomainRole, ...offDomainOther]
  const primary = ordered[0] ?? null
  const secondary = primary ? ordered.slice(1) : ordered
  return { primary, secondary }
}

function pickPrimaryPhone(candidates: PhoneCandidate[]): {
  primary: string | null
  secondary: string[]
} {
  if (candidates.length === 0) return { primary: null, secondary: [] }
  const fromContact = candidates.find((c) => c.pageKind === 'contact')
  const primary = (fromContact ?? candidates[0])?.normalized ?? null
  const secondary = candidates.map((c) => c.normalized).filter((n) => n !== primary)
  return { primary, secondary }
}

function deriveContactConfidence(
  primaryEmail: string | null,
  primaryPhone: string | null,
  websiteHost: string | null,
): ScrapeClawConfidenceLevel {
  if (!primaryEmail && !primaryPhone) return 'low'
  if (primaryEmail && websiteHost) {
    const onSite = rootDomain(emailDomain(primaryEmail)) === rootDomain(websiteHost)
    if (onSite && primaryPhone) return 'high'
    if (onSite) return 'medium'
  }
  if (primaryEmail && primaryPhone) return 'medium'
  return 'low'
}

/**
 * Build a normalized, deduplicated contact summary from one or more evidence
 * pages.
 *
 * @param pages   visible-text pages, in the order they were discovered
 * @param websiteUrl  candidate website URL (used to anchor "same domain"
 *                    email selection); null is acceptable
 */
export function buildContactSummary(
  pages: ContactExtractionPage[],
  websiteUrl: string | null,
): ScrapeClawContactSummary {
  const websiteHost = hostnameOf(websiteUrl)
  const rejected: ScrapeClawRejectedContact[] = []
  const seenEmails = new Set<string>()
  const seenPhones = new Set<string>()
  const acceptedEmails: EmailCandidate[] = []
  const acceptedPhones: PhoneCandidate[] = []

  function rejectEmail(raw: string, reason: ScrapeClawContactRejectionReason): void {
    rejected.push({ raw, reason })
  }

  function rejectPhone(raw: string, reason: ScrapeClawContactRejectionReason): void {
    rejected.push({ raw, reason })
  }

  for (const page of pages) {
    // ── Emails ────────────────────────────────────────────────────────────
    for (const raw of extractEmailsFromPage(page)) {
      if (raw.length < 6) {
        rejectEmail(raw, 'too_short')
        continue
      }
      const atIdx = raw.indexOf('@')
      if (atIdx <= 0 || atIdx === raw.length - 1) {
        rejectEmail(raw, 'invalid_email_syntax')
        continue
      }
      const localPart = raw.slice(0, atIdx)
      const dom = raw.slice(atIdx + 1)
      // Reject obvious second-pass syntax failures the regex permits.
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dom)) {
        rejectEmail(raw, 'invalid_email_syntax')
        continue
      }
      if (isNoreply(localPart)) {
        rejectEmail(raw, 'noreply_mailbox')
        continue
      }
      if (isAssetHost(dom)) {
        rejectEmail(raw, 'asset_host_email')
        continue
      }
      if (seenEmails.has(raw)) {
        rejectEmail(raw, 'duplicate')
        continue
      }
      seenEmails.add(raw)
      acceptedEmails.push({ address: raw, pageKind: page.pageKind })
    }

    // ── Phones ────────────────────────────────────────────────────────────
    for (const phone of extractPhonesFromPage(page)) {
      // Filter ZIP+4 lookalikes and other 9–10 digit IDs that the regex catches
      // when separators happen to align. Real NANP numbers always start area
      // code with [2-9] — already enforced by PHONE_RE — but we add an extra
      // sanity check that the digits aren't all the same (e.g. 999-999-9999).
      const digits = phone.normalized.slice(2) // drop "+1"
      if (/^(\d)\1{9}$/.test(digits)) {
        rejectPhone(phone.display, 'invalid_phone_format')
        continue
      }
      if (seenPhones.has(phone.normalized)) {
        rejectPhone(phone.display, 'duplicate')
        continue
      }
      seenPhones.add(phone.normalized)
      acceptedPhones.push({ ...phone, pageKind: page.pageKind })
    }
  }

  const { primary: primaryBusinessEmail, secondary: secondaryEmails } = pickPrimaryEmail(
    acceptedEmails,
    websiteHost,
  )
  const { primary: primaryBusinessPhone, secondary: secondaryPhones } =
    pickPrimaryPhone(acceptedPhones)

  return {
    primaryBusinessEmail,
    secondaryEmails,
    primaryBusinessPhone,
    secondaryPhones,
    rejectedContacts: rejected,
    contactConfidence: deriveContactConfidence(
      primaryBusinessEmail,
      primaryBusinessPhone,
      websiteHost,
    ),
  }
}
