import { describe, expect, it } from 'vitest'
import { runScrapeClawAgent1Research } from './research.js'
import type { ScrapeClawResearchWorkerInput } from '@clawos/shared'

const SITE_A_HOME = `<html><head><title>Clay County Property Management</title></head><body><a href='/about'>About</a><a href='/services/property-management'>Property Management</a><a href='/contact'>Contact</a><a href='/rentals'>Available Rentals</a>We provide property management, owner services, tenant services, leasing, and rent collection in Green Cove Springs and Clay County. Email us at info@examplepm.com</body></html>`
const SITE_A_ABOUT = `<html><head><title>About Example PM</title></head><body>Family-owned property management company serving Green Cove Springs, Fleming Island, and Middleburg.</body></html>`
const SITE_A_SERVICES = `<html><head><title>Owner & Tenant Services</title></head><body>Owner services, tenant services, maintenance request handling, and leasing for rental properties.</body></html>`
const SITE_A_CONTACT = `<html><head><title>Contact</title></head><body>Call (904) 555-1212 or email hello@examplepm.com</body></html>`
const SITE_A_RENTALS = `<html><head><title>Available Rentals</title></head><body>Available rentals and listing availability updated weekly.</body></html>`
const SITE_B_HOME = `<html><head><title>Acme Injury Law</title></head><body><a href='/about'>About</a><a href='/contact'>Contact</a>Personal injury law firm serving Jacksonville.</body></html>`
const SITE_B_ABOUT = `<html><head><title>About Acme Law</title></head><body>Trial lawyers.</body></html>`
const SITE_B_CONTACT = `<html><head><title>Contact</title></head><body>(904) 555-1313</body></html>`
function mockFetchFactory() {
  const pages = new Map<string, string>([
    ['https://examplepm.com/', SITE_A_HOME],
    ['https://examplepm.com/about', SITE_A_ABOUT],
    ['https://examplepm.com/services/property-management', SITE_A_SERVICES],
    ['https://examplepm.com/contact', SITE_A_CONTACT],
    ['https://examplepm.com/rentals', SITE_A_RENTALS],
    ['https://examplelaw.com/', SITE_B_HOME],
    ['https://examplelaw.com/about', SITE_B_ABOUT],
    ['https://examplelaw.com/contact', SITE_B_CONTACT],
  ])
  return async (input: string | URL | Request) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const html = pages.get(url)
    return html
      ? new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
      : new Response('missing', { status: 404 })
  }
}
describe('runScrapeClawAgent1Research', () => {
  it('collects bounded evidence and ranks property-management candidates first', async () => {
    const input: ScrapeClawResearchWorkerInput = {
      wedgeSlug: 'residential_property_management',
      marketCity: 'Green Cove Springs',
      marketRegion: 'Clay County',
      candidates: [
        {
          name: 'Example Property Management',
          canonicalWebsiteUrl: 'https://examplepm.com/',
          city: 'Green Cove Springs',
          state: 'FL',
        },
        {
          name: 'Acme Injury Law',
          canonicalWebsiteUrl: 'https://examplelaw.com/',
          city: 'Jacksonville',
          state: 'FL',
        },
      ],
      maxPagesPerBusiness: 5,
      maxCandidates: 5,
    }
    const result = await runScrapeClawAgent1Research(input, {
      fetchImpl: mockFetchFactory() as unknown as typeof fetch,
    })
    expect(result.rankedProspects).toHaveLength(2)
    expect(result.rankedProspects[0]?.business.name).toBe('Example Property Management')
    expect(result.rankedProspects[0]?.prospect.status).toBe('qualified')
    expect(result.rankedProspects[0]?.prospect.fitScore).toBeGreaterThan(0.5)
    expect(result.rankedProspects[0]?.evidenceItems.map((item) => item.pageKind)).toEqual(
      expect.arrayContaining(['homepage', 'about', 'services', 'contact', 'niche_relevant']),
    )
    expect(result.rankedProspects[1]?.prospect.fitScore).toBeLessThan(
      result.rankedProspects[0]?.prospect.fitScore ?? 1,
    )
  })
})
