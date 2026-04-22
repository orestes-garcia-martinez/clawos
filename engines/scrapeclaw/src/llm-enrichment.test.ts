import { describe, expect, it } from 'vitest'
import { runScrapeClawAgent1Enrichment } from './llm-enrichment.js'
import type { ScrapeClawEnrichmentWorkerInput } from '@clawos/shared'

const BASE_INPUT: ScrapeClawEnrichmentWorkerInput = {
  mode: 'enrich',
  wedgeSlug: 'residential_property_management',
  marketCity: 'Green Cove Springs',
  marketRegion: 'Clay County',
  prospects: [
    {
      business: {
        name: 'Example Property Management',
        canonicalWebsiteUrl: 'https://examplepm.com/',
        city: 'Green Cove Springs',
        state: 'FL',
      },
      prospect: {
        status: 'qualified',
        wedgeSlug: 'residential_property_management',
        marketCity: 'Green Cove Springs',
        marketRegion: 'Clay County',
        fitScore: 0.61,
        useCaseHypothesis: 'Base use case',
        dataNeedHypothesis: 'Base data need',
        demoTypeRecommendation: 'competitor_listing_feed',
        outreachAngle: 'Base outreach angle',
        confidenceLevel: 'medium',
      },
      evidenceItems: [
        {
          pageKind: 'homepage',
          sourceUrl: 'https://examplepm.com/',
          observedAt: '2026-04-16T00:00:00.000Z',
          title: 'Clay County Property Management',
          snippet: 'Property management and rentals in Green Cove Springs.',
          extractedFacts: {
            matchedTerms: ['property management', 'available rentals'],
            localTerms: ['green cove springs', 'clay county'],
          },
          sourceConfidence: 'medium',
        },
      ],
      reasoning: ['Observed property-management and rental signals on the homepage.'],
    },
  ],
}

function anthropicSuccessFetch() {
  return async () =>
    new Response(
      JSON.stringify({
        content: [
          {
            type: 'tool_use',
            name: 'emit_prospect_judgment',
            input: {
              fitScore: 0.82,
              useCaseHypothesis:
                'Track local rental listings and price changes for competitor monitoring.',
              dataNeedHypothesis:
                'The website exposes listing-style content that can be normalized into a weekly market sheet.',
              demoTypeRecommendation: 'weekly_market_snapshot',
              outreachAngle:
                'Show a clean weekly Clay County market snapshot that saves manual monitoring time.',
              confidenceLevel: 'high',
              reasoningBullets: [
                'Homepage language strongly signals property-management services.',
                'Local references tie the business to the Clay County pilot market.',
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
}

describe('runScrapeClawAgent1Enrichment', () => {
  it('returns structured enriched judgments from Anthropic tool output', async () => {
    const result = await runScrapeClawAgent1Enrichment(BASE_INPUT, {
      apiKey: 'test-key',
      model: 'claude-test',
      fetchImpl: anthropicSuccessFetch() as unknown as typeof fetch,
    })

    expect(result.mode).toBe('enrich')
    expect(result.enrichedProspects).toHaveLength(1)
    expect(result.enrichedProspects[0]?.usedFallback).toBe(false)
    expect(result.enrichedProspects[0]?.enrichedProspect.fitScore).toBe(0.82)
    expect(result.enrichedProspects[0]?.enrichedProspect.demoTypeRecommendation).toBe(
      'weekly_market_snapshot',
    )
    expect(result.enrichedProspects[0]?.llmReasoning).toHaveLength(2)
  })

  it('falls back to the deterministic prospect when the LLM call fails', async () => {
    const result = await runScrapeClawAgent1Enrichment(BASE_INPUT, {
      apiKey: 'test-key',
      model: 'claude-test',
      fetchImpl: (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch,
    })

    expect(result.enrichedProspects[0]?.usedFallback).toBe(true)
    expect(result.enrichedProspects[0]?.enrichedProspect.fitScore).toBe(0.61)
    expect(result.warnings).toHaveLength(1)
  })

  it('respects maxProspects and only processes the first N prospects', async () => {
    const multiInput = {
      ...BASE_INPUT,
      prospects: [BASE_INPUT.prospects[0]!, BASE_INPUT.prospects[0]!, BASE_INPUT.prospects[0]!],
      maxProspects: 1,
    }

    let callCount = 0
    const countingFetch = async () => {
      callCount++
      return anthropicSuccessFetch()()
    }

    const result = await runScrapeClawAgent1Enrichment(multiInput, {
      apiKey: 'test-key',
      model: 'claude-test',
      fetchImpl: countingFetch as unknown as typeof fetch,
    })

    expect(callCount).toBe(1)
    expect(result.enrichedProspects).toHaveLength(1)
  })

  it('falls back when the LLM tool output fails schema validation', async () => {
    const invalidToolFetch = async () =>
      new Response(
        JSON.stringify({
          content: [
            {
              type: 'tool_use',
              name: 'emit_prospect_judgment',
              input: {
                fitScore: 'not-a-number',
                useCaseHypothesis: 'ok',
                dataNeedHypothesis: 'ok',
                demoTypeRecommendation: 'ok',
                outreachAngle: 'ok',
                confidenceLevel: 'high',
                reasoningBullets: ['ok'],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )

    const result = await runScrapeClawAgent1Enrichment(BASE_INPUT, {
      apiKey: 'test-key',
      model: 'claude-test',
      fetchImpl: invalidToolFetch as unknown as typeof fetch,
    })

    expect(result.enrichedProspects[0]?.usedFallback).toBe(true)
    expect(result.enrichedProspects[0]?.enrichedProspect.fitScore).toBe(0.61)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.reason).toMatch(/invalid/i)
  })
})
