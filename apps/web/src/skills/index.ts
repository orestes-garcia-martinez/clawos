/**
 * skills/index.ts — ClawOS skill registry.
 *
 * Each SkillDefinition owns:
 *   - identity (key, name, status)
 *   - hero content (title, body)
 *   - workspace navigation items
 *   - quick action suggestions
 *   - composer placeholder copy
 *
 * The platform shell is never hard-coded to CareerClaw.
 * Adding a new skill = add a new entry here.
 */

export type SkillKey = 'careerclaw' | 'scrapeclaw' | 'investclaw'
export type SkillStatus = 'active' | 'installed' | 'coming_soon'

export interface QuickAction {
  label: string
  description: string
  pro?: boolean
}

export interface SkillNavItem {
  id: string
  label: string
}

export interface SkillDefinition {
  key: SkillKey
  name: string
  version?: string
  status: SkillStatus
  heroTitle: string
  heroBody: string
  trustSignal: string
  nav: SkillNavItem[]
  quickActions: QuickAction[]
  composerPlaceholder: string
}

// ── Registry ───────────────────────────────────────────────────────────────

const careerclaw: SkillDefinition = {
  key: 'careerclaw',
  name: 'CareerClaw',
  version: 'v1.0.4',
  status: 'active',
  heroTitle: 'Ready to hunt.',
  heroBody:
    'CareerClaw finds best-fit jobs, scores them against your profile, and drafts personalised outreach — all from a single command.',
  trustSignal: '246 tests passing · security-first · no marketplace risk',
  nav: [
    { id: 'chat', label: 'Chat' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'history', label: 'History' },
  ],
  quickActions: [
    {
      label: "Run today's job briefing",
      description: 'Fetch + score latest matches',
    },
    {
      label: 'Draft outreach for top match',
      description: 'Resume-aware, LLM-crafted',
    },
    {
      label: 'Analyse my resume gaps',
      description: 'Identify missing keywords',
      pro: true,
    },
    {
      label: 'Find remote TypeScript roles',
      description: 'Search across all sources',
    },
  ],
  composerPlaceholder: "Upload your resume or ask for today's briefing",
}

const scrapeclaw: SkillDefinition = {
  key: 'scrapeclaw',
  name: 'ScrapeClaw',
  status: 'installed',
  heroTitle: 'Monitor the web with precision.',
  heroBody:
    'ScrapeClaw tracks target pages, extracts structured fields, and alerts you when something changes — inside the same ClawOS shell.',
  trustSignal: 'Coming in Phase 2',
  nav: [
    { id: 'chat', label: 'Chat' },
    { id: 'monitors', label: 'Monitors' },
    { id: 'results', label: 'Results' },
    { id: 'history', label: 'History' },
  ],
  quickActions: [
    { label: 'Create a monitor', description: 'Track a page or selector' },
    { label: 'Run a fresh extraction', description: 'Pull the latest data' },
    { label: 'Review change alerts', description: 'See what changed', pro: true },
    { label: 'Export results', description: 'Download CSV or JSON' },
  ],
  composerPlaceholder: 'Paste a URL or ask ScrapeClaw to monitor a page',
}

const investclaw: SkillDefinition = {
  key: 'investclaw',
  name: 'InvestClaw',
  status: 'coming_soon',
  heroTitle: 'Signal over noise.',
  heroBody:
    'InvestClaw will summarise watchlists, surface movements, and organise market signals without breaking the ClawOS platform shell.',
  trustSignal: 'Coming in Phase 3',
  nav: [
    { id: 'chat', label: 'Chat' },
    { id: 'watchlist', label: 'Watchlist' },
    { id: 'signals', label: 'Signals' },
    { id: 'history', label: 'History' },
  ],
  quickActions: [
    { label: 'Review watchlist', description: 'See tracked assets' },
    { label: 'Generate market summary', description: 'Condense movement' },
    { label: 'Inspect signal changes', description: 'Spot trend shifts' },
    { label: 'Prepare brief', description: 'Organise insights' },
  ],
  composerPlaceholder: 'Ask InvestClaw about a watchlist or market signal',
}

export const SKILLS: SkillDefinition[] = [careerclaw, scrapeclaw, investclaw]

export const SKILL_MAP: Record<SkillKey, SkillDefinition> = {
  careerclaw,
  scrapeclaw,
  investclaw,
}

// Platform-level nav sections (ClawOS-owned, not skill-specific)
export interface PlatformNavItem {
  id: string
  label: string
  path: string
}

export const PLATFORM_NAV: PlatformNavItem[] = [
  { id: 'settings', label: 'Settings', path: '/settings' },
]
