import { z } from 'zod'
import type {
  ScrapeClawConfidenceLevel,
  ScrapeClawEnrichedProspectResult,
  ScrapeClawEnrichmentWorkerInput,
  ScrapeClawEnrichmentWorkerResult,
  ScrapeClawProspectDraft,
  ScrapeClawResearchProspectResult,
} from '@clawos/shared'
import {
  SCRAPECLAW_ANTHROPIC_MESSAGES_URL,
  SCRAPECLAW_DEFAULT_ENRICHMENT_MODEL,
  SCRAPECLAW_DEFAULT_LLM_CALL_TIMEOUT_MS,
  SCRAPECLAW_DEFAULT_MAX_ENRICHMENT_PROSPECTS,
  SCRAPECLAW_ENRICHMENT_PROMPT_VERSION,
} from './constants.js'
import type { RunScrapeClawEnrichmentOptions } from './types.js'

const EnrichmentToolInputSchema = z.object({
  fitScore: z.number().min(0).max(1),
  useCaseHypothesis: z.string().min(1).max(2_000),
  dataNeedHypothesis: z.string().min(1).max(2_000),
  demoTypeRecommendation: z.string().min(1).max(120),
  outreachAngle: z.string().min(1).max(1_000),
  confidenceLevel: z.enum(['low', 'medium', 'high']),
  reasoningBullets: z.array(z.string().min(1).max(500)).min(1).max(5),
})

type EnrichmentToolInput = z.infer<typeof EnrichmentToolInputSchema>

const EMIT_PROSPECT_JUDGMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fitScore: { type: 'number', minimum: 0, maximum: 1 },
    useCaseHypothesis: { type: 'string', minLength: 1, maxLength: 2000 },
    dataNeedHypothesis: { type: 'string', minLength: 1, maxLength: 2000 },
    demoTypeRecommendation: { type: 'string', minLength: 1, maxLength: 120 },
    outreachAngle: { type: 'string', minLength: 1, maxLength: 1000 },
    confidenceLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
    reasoningBullets: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 500 },
      minItems: 1,
      maxItems: 5,
    },
  },
  required: [
    'fitScore',
    'useCaseHypothesis',
    'dataNeedHypothesis',
    'demoTypeRecommendation',
    'outreachAngle',
    'confidenceLevel',
    'reasoningBullets',
  ],
} as const

function clampFitScore(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4))
}

function summariseEvidence(result: ScrapeClawResearchProspectResult): string {
  return result.evidenceItems
    .map((item, index) => {
      const facts =
        item.extractedFacts && typeof item.extractedFacts === 'object' ? item.extractedFacts : {}
      const matchedTerms = Array.isArray((facts as { matchedTerms?: unknown }).matchedTerms)
        ? ((facts as { matchedTerms?: unknown[] }).matchedTerms ?? []).slice(0, 6).join(', ')
        : ''
      const localTerms = Array.isArray((facts as { localTerms?: unknown }).localTerms)
        ? ((facts as { localTerms?: unknown[] }).localTerms ?? []).slice(0, 4).join(', ')
        : ''
      const channels = [
        matchedTerms ? `matched terms: ${matchedTerms}` : null,
        localTerms ? `local terms: ${localTerms}` : null,
      ]
        .filter(Boolean)
        .join('; ')
      return [
        `${index + 1}. page kind: ${item.pageKind}`,
        `url: ${item.sourceUrl}`,
        item.title ? `title: ${item.title}` : null,
        item.snippet ? `snippet: ${item.snippet}` : null,
        channels || null,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
}

function buildPrompt(result: ScrapeClawResearchProspectResult): string {
  return [
    'You are evaluating a prospective ScrapeClaw client in the residential property management wedge.',
    'Use only the evidence provided. Do not invent facts, pages, or business capabilities that are not grounded in the evidence.',
    'Return one structured judgment through the required tool call.',
    '',
    `Business name: ${result.business.name}`,
    `Website: ${result.business.canonicalWebsiteUrl}`,
    result.business.city ? `City: ${result.business.city}` : null,
    result.business.state ? `State: ${result.business.state}` : null,
    result.business.businessType ? `Business type: ${result.business.businessType}` : null,
    '',
    'Deterministic baseline judgment:',
    `- fit score: ${result.prospect.fitScore}`,
    `- use case hypothesis: ${result.prospect.useCaseHypothesis}`,
    `- data need hypothesis: ${result.prospect.dataNeedHypothesis}`,
    `- demo type recommendation: ${result.prospect.demoTypeRecommendation}`,
    `- outreach angle: ${result.prospect.outreachAngle}`,
    `- confidence level: ${result.prospect.confidenceLevel}`,
    '',
    'Deterministic reasoning:',
    ...result.reasoning.map((item) => `- ${item}`),
    '',
    'Evidence pages:',
    summariseEvidence(result),
    '',
    'Your task:',
    '- refine the business fit score',
    '- refine the use-case and data-need hypotheses',
    '- recommend the best initial demo type',
    '- write a concise outreach angle grounded in the evidence',
    '- set confidence low/medium/high based on the evidence quality',
    '- provide 1-5 short reasoning bullets referencing only the supplied evidence',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildSystemPrompt(): string {
  return [
    'You are ScrapeClaw Agent 1 enrichment.',
    'You sit on top of a deterministic evidence pipeline and may only refine the judgment, not browse or fetch anything new.',
    'Prefer conservative judgments. If evidence is thin, lower the score and confidence.',
    'Do not mention internal systems, LLMs, prompts, or implementation details in the output.',
  ].join(' ')
}

async function callAnthropicStructured(
  fetchImpl: typeof fetch,
  params: { apiKey: string; model: string; prompt: string },
): Promise<EnrichmentToolInput> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SCRAPECLAW_DEFAULT_LLM_CALL_TIMEOUT_MS)
  try {
    const response = await fetchImpl(SCRAPECLAW_ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: params.model,
        max_tokens: 1_500,
        temperature: 0,
        system: buildSystemPrompt(),
        tool_choice: { type: 'tool', name: 'emit_prospect_judgment' },
        tools: [
          {
            name: 'emit_prospect_judgment',
            description: 'Emit the final structured prospect judgment.',
            input_schema: EMIT_PROSPECT_JUDGMENT_SCHEMA,
          },
        ],
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: params.prompt }],
          },
        ],
      }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(
        `Anthropic enrichment failed with ${response.status}: ${text.slice(0, 200) || response.statusText}`,
      )
    }

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; name?: string; input?: unknown }>
    }

    const toolUse = payload.content?.find(
      (block) => block.type === 'tool_use' && block.name === 'emit_prospect_judgment',
    )
    if (!toolUse?.input) throw new Error('Anthropic enrichment returned no structured tool payload')
    return EnrichmentToolInputSchema.parse(toolUse.input)
  } finally {
    clearTimeout(timer)
  }
}

function mergeProspect(
  base: ScrapeClawProspectDraft,
  enriched: EnrichmentToolInput,
): ScrapeClawProspectDraft {
  const fitScore = clampFitScore(enriched.fitScore)
  return {
    ...base,
    fitScore,
    status: fitScore >= 0.35 ? 'qualified' : 'disqualified',
    useCaseHypothesis: enriched.useCaseHypothesis,
    dataNeedHypothesis: enriched.dataNeedHypothesis,
    demoTypeRecommendation: enriched.demoTypeRecommendation,
    outreachAngle: enriched.outreachAngle,
    confidenceLevel: enriched.confidenceLevel as ScrapeClawConfidenceLevel,
  }
}

function fallbackResult(
  result: ScrapeClawResearchProspectResult,
  model: string,
): ScrapeClawEnrichedProspectResult {
  return {
    business: result.business,
    baseProspect: result.prospect,
    enrichedProspect: result.prospect,
    evidenceItems: result.evidenceItems,
    deterministicReasoning: result.reasoning,
    llmReasoning: [],
    provider: 'anthropic',
    model,
    promptVersion: SCRAPECLAW_ENRICHMENT_PROMPT_VERSION,
    usedFallback: true,
  }
}

export async function runScrapeClawAgent1Enrichment(
  input: ScrapeClawEnrichmentWorkerInput,
  options: RunScrapeClawEnrichmentOptions,
): Promise<ScrapeClawEnrichmentWorkerResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (!fetchImpl) throw new Error('Global fetch is not available in this runtime')
  const model = input.model ?? options.model ?? SCRAPECLAW_DEFAULT_ENRICHMENT_MODEL
  const warnings: ScrapeClawEnrichmentWorkerResult['warnings'] = []

  const batch = input.prospects.slice(
    0,
    input.maxProspects ?? SCRAPECLAW_DEFAULT_MAX_ENRICHMENT_PROSPECTS,
  )

  const settled = await Promise.all(
    batch.map((prospect) =>
      callAnthropicStructured(fetchImpl, {
        apiKey: options.apiKey,
        model,
        prompt: buildPrompt(prospect),
      })
        .then((enriched) => ({ prospect, enriched, error: null }))
        .catch((error: unknown) => ({ prospect, enriched: null, error })),
    ),
  )

  const enrichedProspects: ScrapeClawEnrichedProspectResult[] = settled.map(
    ({ prospect, enriched, error }) => {
      if (enriched) {
        return {
          business: prospect.business,
          baseProspect: prospect.prospect,
          enrichedProspect: mergeProspect(prospect.prospect, enriched),
          evidenceItems: prospect.evidenceItems,
          deterministicReasoning: prospect.reasoning,
          llmReasoning: enriched.reasoningBullets,
          provider: 'anthropic',
          model,
          promptVersion: SCRAPECLAW_ENRICHMENT_PROMPT_VERSION,
          usedFallback: false,
        }
      }
      warnings.push({
        businessName: prospect.business.name,
        reason: error instanceof Error ? error.message : 'Unknown enrichment error',
      })
      return fallbackResult(prospect, model)
    },
  )

  return {
    mode: 'enrich',
    wedgeSlug: input.wedgeSlug,
    marketCity: input.marketCity,
    marketRegion: input.marketRegion,
    generatedAt: new Date().toISOString(),
    enrichedProspects,
    warnings,
  }
}
