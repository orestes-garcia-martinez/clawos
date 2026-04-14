import { describe, expect, it } from 'vitest'

import { buildScrapeClawAttachmentPath, buildScrapeClawPackagePrefix } from './storage.js'
import { SCRAPECLAW_ATTACHMENT_KINDS, SCRAPECLAW_PACKAGE_STATUSES } from './types.js'

describe('scrapeclaw shared contracts', () => {
  it('builds the canonical package prefix', () => {
    expect(buildScrapeClawPackagePrefix('user-123', 'pkg-456')).toBe(
      'users/user-123/scrapeclaw/packages/pkg-456',
    )
  })

  it('normalizes attachment paths under the canonical package prefix', () => {
    expect(
      buildScrapeClawAttachmentPath({
        userId: 'user-123',
        packageId: 'pkg-456',
        filename: '/demo.csv',
      }),
    ).toBe('users/user-123/scrapeclaw/packages/pkg-456/demo.csv')
  })

  it('keeps the approved package statuses stable', () => {
    expect(SCRAPECLAW_PACKAGE_STATUSES).toEqual([
      'generating',
      'draft',
      'approved',
      'queued',
      'sent',
      'failed',
      'archived',
      'rejected',
    ])
  })

  it('keeps the approved attachment kinds stable', () => {
    expect(SCRAPECLAW_ATTACHMENT_KINDS).toEqual(['csv', 'json', 'manifest', 'summary_pdf'])
  })
})
