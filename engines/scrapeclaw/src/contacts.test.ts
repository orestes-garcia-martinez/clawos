import { describe, expect, it } from 'vitest'
import { buildContactSummary, type ContactExtractionPage } from './contacts.js'

function page(
  pageKind: ContactExtractionPage['pageKind'],
  visibleText: string,
): ContactExtractionPage {
  return { pageKind, visibleText }
}

describe('buildContactSummary', () => {
  it('returns empty summary when no contacts are present', () => {
    const summary = buildContactSummary(
      [page('homepage', 'We provide property management services.')],
      'https://examplepm.com/',
    )
    expect(summary.primaryBusinessEmail).toBeNull()
    expect(summary.primaryBusinessPhone).toBeNull()
    expect(summary.contactConfidence).toBe('low')
    expect(summary.rejectedContacts).toEqual([])
  })

  it('prefers a role-based, on-domain email over an off-domain one', () => {
    const summary = buildContactSummary(
      [page('contact', 'Reach the owner at owner@gmail.com or our office at info@examplepm.com.')],
      'https://examplepm.com/',
    )
    expect(summary.primaryBusinessEmail).toBe('info@examplepm.com')
    expect(summary.secondaryEmails).toContain('owner@gmail.com')
  })

  it('prefers any on-domain email over a role-based off-domain email', () => {
    const summary = buildContactSummary(
      [page('contact', 'Email randomname@examplepm.com or info@gmail.com.')],
      'https://examplepm.com/',
    )
    expect(summary.primaryBusinessEmail).toBe('randomname@examplepm.com')
    expect(summary.secondaryEmails).toContain('info@gmail.com')
  })

  it('rejects noreply mailboxes and asset-host addresses', () => {
    const summary = buildContactSummary(
      [
        page(
          'homepage',
          'Auto: noreply@examplepm.com. Asset: hello@123.gstatic.com. Real: contact@examplepm.com.',
        ),
      ],
      'https://examplepm.com/',
    )
    expect(summary.primaryBusinessEmail).toBe('contact@examplepm.com')
    const reasons = summary.rejectedContacts.map((c) => c.reason)
    expect(reasons).toContain('noreply_mailbox')
    expect(reasons).toContain('asset_host_email')
  })

  it('normalizes phone numbers and prefers a contact-page phone', () => {
    const summary = buildContactSummary(
      [page('homepage', 'Sometimes (904) 555-1234.'), page('contact', 'Best line: 904-555-9999.')],
      'https://examplepm.com/',
    )
    expect(summary.primaryBusinessPhone).toBe('+19045559999')
    expect(summary.secondaryPhones).toContain('+19045551234')
  })

  it('rejects clearly-invalid numeric strings', () => {
    const summary = buildContactSummary(
      [page('homepage', 'License #1234567890 — not a phone. Dial all-nines: 999-999-9999.')],
      'https://examplepm.com/',
    )
    // Both should fail: 1234567890 starts with 1 in the area code (NANP rule
    // requires 2-9), and 999-999-9999 trips the all-same-digit guard.
    expect(summary.primaryBusinessPhone).toBeNull()
  })

  it('deduplicates emails and phones across pages', () => {
    const summary = buildContactSummary(
      [
        page('homepage', 'Email info@examplepm.com or call (904) 555-1212.'),
        page('contact', 'Email info@examplepm.com or call (904) 555-1212.'),
      ],
      'https://examplepm.com/',
    )
    expect(summary.secondaryEmails).toEqual([])
    expect(summary.secondaryPhones).toEqual([])
    expect(summary.rejectedContacts.filter((c) => c.reason === 'duplicate').length).toBeGreaterThan(
      0,
    )
  })

  it('reports high confidence when on-domain email and phone are both present', () => {
    const summary = buildContactSummary(
      [page('contact', 'Email info@examplepm.com or call (904) 555-1212.')],
      'https://examplepm.com/',
    )
    expect(summary.contactConfidence).toBe('high')
  })

  it('reports low confidence when only an off-domain email is present', () => {
    const summary = buildContactSummary(
      [page('contact', 'Email contact@gmail.com')],
      'https://examplepm.com/',
    )
    expect(summary.contactConfidence).toBe('low')
  })
})
