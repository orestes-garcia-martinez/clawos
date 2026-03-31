import type { SessionMatchEntry, SessionState } from '@clawos/shared'

interface ResolvedMatchReference {
  rank: number
  job_id: string
  title: string
  company: string
  score: number
}

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function uniqueByJobId(matches: ResolvedMatchReference[]): ResolvedMatchReference[] {
  const seen = new Set<string>()
  return matches.filter((m) => {
    if (seen.has(m.job_id)) return false
    seen.add(m.job_id)
    return true
  })
}

// Supports common ordinal references for top-ranked briefing results.
// Expanded beyond 1–3 so follow-up prompts like "match #4" still resolve
// when the session contains more than three matches.
function ordinalToIndex(message: string): number[] {
  const normalized = normalize(message)
  const results: number[] = []

  const patterns: Array<[RegExp, number]> = [
    [/\btop match\b/, 0],
    [/\bfirst match\b/, 0],
    [/\bfirst one\b/, 0],
    [/\bmatch\s*#?\s*1\b/, 0],

    [/\bsecond match\b/, 1],
    [/\bsecond one\b/, 1],
    [/\bmatch\s*#?\s*2\b/, 1],

    [/\bthird match\b/, 2],
    [/\bthird one\b/, 2],
    [/\bmatch\s*#?\s*3\b/, 2],

    [/\bfourth match\b/, 3],
    [/\bfourth one\b/, 3],
    [/\bmatch\s*#?\s*4\b/, 3],

    [/\bfifth match\b/, 4],
    [/\bfifth one\b/, 4],
    [/\bmatch\s*#?\s*5\b/, 4],

    [/\bsixth match\b/, 5],
    [/\bsixth one\b/, 5],
    [/\bmatch\s*#?\s*6\b/, 5],

    [/\bseventh match\b/, 6],
    [/\bseventh one\b/, 6],
    [/\bmatch\s*#?\s*7\b/, 6],

    [/\beighth match\b/, 7],
    [/\beighth one\b/, 7],
    [/\bmatch\s*#?\s*8\b/, 7],

    [/\bninth match\b/, 8],
    [/\bninth one\b/, 8],
    [/\bmatch\s*#?\s*9\b/, 8],

    [/\btenth match\b/, 9],
    [/\btenth one\b/, 9],
    [/\bmatch\s*#?\s*10\b/, 9],
  ]

  for (const [pattern, index] of patterns) {
    if (pattern.test(normalized)) results.push(index)
  }

  return results
}

function matchesWholePhrase(normalizedMessage: string, normalizedPhrase: string): boolean {
  if (!normalizedMessage || !normalizedPhrase) return false

  const escaped = escapeRegex(normalizedPhrase)
  const pattern = new RegExp(`\\b${escaped}\\b`)
  return pattern.test(normalizedMessage)
}

function matchesSingleToken(normalizedMessage: string, normalizedToken: string): boolean {
  if (!normalizedMessage || !normalizedToken) return false
  if (normalizedToken.length < 3) return false

  const words = normalizedMessage.split(/\s+/)
  return words.includes(normalizedToken)
}

function matchesReference(normalizedMessage: string, rawValue: string): boolean {
  const candidate = normalize(rawValue)
  if (!candidate) return false

  const isSingleToken = !candidate.includes(' ')
  if (isSingleToken) {
    return matchesSingleToken(normalizedMessage, candidate)
  }

  return matchesWholePhrase(normalizedMessage, candidate)
}

function resolveByText(message: string, matches: SessionMatchEntry[]): ResolvedMatchReference[] {
  const normalizedMessage = normalize(message)
  const specific: ResolvedMatchReference[] = []
  const broad: ResolvedMatchReference[] = []

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]!
    const companyMatched = matchesReference(normalizedMessage, match.company)
    const titleMatched = matchesReference(normalizedMessage, match.title)
    const entry: ResolvedMatchReference = {
      rank: i + 1,
      job_id: match.job_id,
      title: match.title,
      company: match.company,
      score: match.score,
    }

    if (companyMatched && titleMatched) {
      specific.push(entry)
    } else if (companyMatched || titleMatched) {
      broad.push(entry)
    }
  }

  return specific.length > 0 ? specific : broad
}

export function resolveReferencedMatches(
  message: string,
  state: SessionState,
): ResolvedMatchReference[] {
  const briefing = state.briefing
  if (!briefing || briefing.matches.length === 0) return []

  const fromOrdinals = ordinalToIndex(message)
    .map((index) => briefing.matches[index])
    .filter(Boolean)
    .map((match) => ({
      rank: briefing.matches.findIndex((m) => m.job_id === match!.job_id) + 1,
      job_id: match!.job_id,
      title: match!.title,
      company: match!.company,
      score: match!.score,
    }))

  const fromText = resolveByText(message, briefing.matches)

  return uniqueByJobId([...fromOrdinals, ...fromText])
}

export function buildActiveBriefingGroundingMessage(state: SessionState): string | null {
  const briefing = state.briefing
  if (!briefing || briefing.matches.length === 0) return null

  const lines = briefing.matches.map((match, index) => {
    const matchData = briefing.matchData[index] ?? {}
    const matchedKeywords = Array.isArray(matchData['matched_keywords'])
      ? (matchData['matched_keywords'] as string[])
      : []
    const gapKeywords = Array.isArray(matchData['gap_keywords'])
      ? (matchData['gap_keywords'] as string[])
      : []

    const hasGapResult = Boolean(state.gapResults?.[match.job_id])
    const hasCoverLetterResult = Boolean(state.coverLetterResults?.[match.job_id])

    return [
      `${index + 1}. job_id=${match.job_id}`,
      `title=${match.title}`,
      `company=${match.company}`,
      `score=${Math.round(match.score * 100)}%`,
      `matched_keywords=${matchedKeywords.length > 0 ? matchedKeywords.join(', ') : 'none'}`,
      `gap_keywords=${gapKeywords.length > 0 ? gapKeywords.join(', ') : 'none'}`,
      `gap_analysis_cached=${hasGapResult ? 'yes' : 'no'}`,
      `cover_letter_cached=${hasCoverLetterResult ? 'yes' : 'no'}`,
      `url=${match.url ?? 'none'}`,
    ].join(' | ')
  })

  return [
    '[Active briefing ground truth — use this as the authoritative source for follow-up questions]',
    'Rules:',
    '- Use only these cached scores and match facts when answering follow-up questions.',
    '- Never restate or invent a different percentage than the one shown here.',
    '- If the user asks to compare matches, compare them from this cached briefing data first.',
    '- Do not claim a gap analysis exists unless gap_analysis_cached=yes.',
    '- Do not claim a cover letter exists unless cover_letter_cached=yes.',
    '',
    ...lines,
  ].join('\n')
}

export function buildReferencedMatchesHint(message: string, state: SessionState): string | null {
  const references = resolveReferencedMatches(message, state)
  if (references.length === 0) return null

  const lines = references.map(
    (ref) =>
      `- rank=${ref.rank} | job_id=${ref.job_id} | ${ref.title} at ${ref.company} | ${Math.round(
        ref.score * 100,
      )}%`,
  )

  if (references.length === 1) {
    return [
      '[Referenced current-briefing match for this turn]',
      ...lines,
      'If the user wants a deep analysis or cover letter for this role, use this exact job_id.',
    ].join('\n')
  }

  return [
    '[The user referenced multiple current-briefing matches in this turn]',
    ...lines,
    'If the user is asking for comparison, answer from cached briefing data first.',
    'If the user is asking for deep analysis or a cover letter, ask them to choose one match first.',
    'Do not pretend that two separate gap analyses or cover letters were already run in this turn.',
  ].join('\n')
}
