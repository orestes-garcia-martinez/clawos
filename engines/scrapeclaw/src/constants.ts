export const SCRAPECLAW_DEFAULT_USER_AGENT = 'ClawOS-ScrapeClaw/0.1 (+https://clawoshq.com)'
export const SCRAPECLAW_DEFAULT_MAX_CANDIDATES = 10
export const SCRAPECLAW_DEFAULT_MAX_PAGES_PER_BUSINESS = 6
export const SCRAPECLAW_DEFAULT_FETCH_TIMEOUT_MS = 8_000

export const SCRAPECLAW_DEFAULT_TEXT_SEARCH_PAGE_SIZE = 20
export const SCRAPECLAW_DEFAULT_MIN_PRIMARY_RESULTS_BEFORE_FALLBACK = 5

export const SCRAPECLAW_CLAY_COUNTY_HUBS = [
  'Orange Park',
  'Fleming Island',
  'Middleburg',
  'Green Cove Springs',
  'Oakleaf Plantation',
] as const

export const SCRAPECLAW_CLAY_COUNTY_BOUNDING_BOX = {
  low: { latitude: 29.718, longitude: -82.049 },
  high: { latitude: 30.22, longitude: -81.636 },
} as const

export const SCRAPECLAW_PRIMARY_DISCOVERY_TEMPLATE = '{wedge} in {hub}, FL'
export const SCRAPECLAW_FALLBACK_DISCOVERY_TEMPLATE = '{fallback} in {hub}, FL'
export const SCRAPECLAW_PRIMARY_DISCOVERY_WEDGE = 'Property Management'
export const SCRAPECLAW_FALLBACK_DISCOVERY_CATEGORY = 'Real Estate Agency'

export const SCRAPECLAW_GOOGLE_PLACES_TEXT_SEARCH_URL =
  'https://places.googleapis.com/v1/places:searchText'
export const SCRAPECLAW_GOOGLE_PLACES_DETAILS_BASE_URL = 'https://places.googleapis.com/v1/places'
export const SCRAPECLAW_GOOGLE_PLACES_TEXT_SEARCH_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
] as const
export const SCRAPECLAW_GOOGLE_PLACES_DETAILS_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'websiteUri',
] as const

export const PROPERTY_MANAGEMENT_TERMS = [
  'property management',
  'property manager',
  'property managers',
  'rental property',
  'rental properties',
  'owners',
  'owner services',
  'tenant',
  'tenant services',
  'leasing',
  'lease',
  'rent collection',
  'maintenance request',
  'hoa',
] as const

export const INVESTOR_TERMS = [
  'investor',
  'investors',
  'investment property',
  'cash flow',
  'portfolio',
] as const

export const LISTING_TERMS = [
  'available rentals',
  'rental listings',
  'homes for rent',
  'for rent',
  'listings',
  'availability',
  'vacancy',
  'vacancies',
] as const

export const LOCAL_MARKET_TERMS = [
  'green cove springs',
  'clay county',
  'fleming island',
  'middleburg',
  'orange park',
  'jacksonville',
  'st. johns',
  'st johns',
] as const

export const SCRAPECLAW_ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
export const SCRAPECLAW_DEFAULT_ENRICHMENT_MODEL = 'claude-haiku-4-5-20251001'
export const SCRAPECLAW_DEFAULT_LLM_CALL_TIMEOUT_MS = 25_000
export const SCRAPECLAW_ENRICHMENT_PROMPT_VERSION = 'scrapeclaw-enrichment-v1'
export const SCRAPECLAW_DEFAULT_MAX_ENRICHMENT_PROSPECTS = 10

// ── Phase 4a — Production hardening constants ────────────────────────────────

/**
 * Qualified/disqualified threshold for the deterministic final score.
 * Phase 4a kept the existing 0.35 cutoff per Q3: tighter filtering is the
 * goal, so we accept fewer-but-higher-quality prospects from decomposed
 * scoring.
 */
export const SCRAPECLAW_PROSPECT_QUALIFIED_THRESHOLD = 0.35

/**
 * Weighted combination for the decomposed deterministic score. Sums to 1.0.
 * Wedge match dominates; locality and inventory contribute meaningfully;
 * website quality, contacts, and evidence richness round out the signal.
 */
export const SCRAPECLAW_DETERMINISTIC_SCORE_WEIGHTS = {
  wedgeMatch: 0.32,
  inventorySignal: 0.18,
  locality: 0.18,
  websiteQuality: 0.12,
  contactQuality: 0.1,
  evidenceRichness: 0.1,
} as const

/**
 * Suspicious content terms used by compromised-page detection.
 * Global list (not wedge-keyed) — these patterns are spam markers regardless
 * of wedge. See Phase 4a Q&A for rationale.
 *
 * Trigger: a page is flagged suspicious when it contains >= MIN distinct
 * suspicious terms AND zero wedge-vocabulary terms. The "zero wedge terms"
 * guard prevents false positives like a property manager whose blog mentions
 * "casino night fundraiser".
 *
 * The list has two tiers:
 *   - English-specific: unambiguous spam terms unlikely in legitimate PM content.
 *   - Cross-language gambling vocabulary: terms that appear in gambling/betting
 *     spam regardless of the page's primary language. "slot" alone is excluded
 *     (false-positive risk: "time slot", "appointment slot").
 */
export const SCRAPECLAW_SUSPICIOUS_CONTENT_TERMS = [
  // ── English-specific ──────────────────────────────────────────────────────
  'casino',
  'slot machine',
  'baccarat',
  'roulette',
  'sports betting',
  'online poker',
  'porn',
  'xxx',
  'escort',
  'adult cam',
  'viagra',
  'cialis',
  'pharmacy online',
  'cheap meds',
  'cryptocurrency airdrop',
  'pump signal',
  'shitcoin',
  'memecoin pump',
  'replica watch',
  'fake rolex',
  'designer replica',
  'cheap jordans',
  // ── Cross-language gambling vocabulary ────────────────────────────────────
  'jackpot',
  'gambling',
  'sportsbook',
  'sports book',
  'free spins',
  'online betting',
  'maxwin',
  'scatter slot',
  'bonus slot',
] as const

export const SCRAPECLAW_SUSPICIOUS_PAGE_MIN_TERMS = 3

/**
 * Minimum title character length for the title-divergence heuristic.
 * Titles shorter than this are too generic ("Contact Us", "Home") to be
 * reliable indicators of off-topic injection. Titles at or above this length
 * that contain zero wedge vocabulary AND zero content wedge signal are flagged
 * as suspicious regardless of language.
 */
export const SCRAPECLAW_SUSPICIOUS_TITLE_MIN_LENGTH = 40

/** Score multiplier applied to websiteQuality when a page is compromised. */
export const SCRAPECLAW_COMPROMISED_PAGE_QUALITY_PENALTY = 0.4

/**
 * Pre-rank — name-token signals that strongly indicate the wedge.
 * Subset of PROPERTY_MANAGEMENT_TERMS that survives in Google Places display
 * names (which are noun-phrase business names, not prose).
 */
export const SCRAPECLAW_PRE_RANK_NAME_WEDGE_TOKENS = [
  'property management',
  'property manager',
  'rental',
  'rentals',
  'leasing',
  'lease',
  'realty',
  'real estate',
  'homes',
] as const

/**
 * Pre-rank — name patterns that should be hard-demoted when the locked wedge
 * is residential property management. Per Q4: heavy negative weight rather
 * than hard exclusion, so the deterministic research pass can still confirm
 * or reject.
 */
export const SCRAPECLAW_PRE_RANK_OUT_OF_SCOPE_NAME_PATTERNS = [
  'hoa',
  'homeowners association',
  'homeowner association',
  'community association',
  'condo association',
  'condominium association',
  'master association',
] as const

/** Pre-rank weights. Score is sum of sub-scores; clamped to [0, 1]. */
export const SCRAPECLAW_PRE_RANK_WEIGHTS = {
  nameWedge: 0.55,
  locality: 0.2,
  websiteQuality: 0.15,
  queryQuality: 0.05,
  /** Magnitude of the demotion applied per matched out-of-scope pattern. */
  outOfScopePenalty: 0.6,
} as const

/**
 * Email mailbox local-parts that signal a publicly stated business contact.
 * Used by the contact summary to choose `primaryBusinessEmail`.
 */
export const SCRAPECLAW_ROLE_BASED_MAILBOXES = [
  'info',
  'contact',
  'hello',
  'office',
  'leasing',
  'sales',
  'admin',
] as const

/** Mailbox prefixes that should never become `primaryBusinessEmail`. */
export const SCRAPECLAW_NOREPLY_MAILBOX_PREFIXES = [
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
] as const

/**
 * Hostnames where extracted emails are almost always asset references
 * (e.g. CDN sentinel addresses), not business contacts.
 */
export const SCRAPECLAW_ASSET_EMAIL_HOST_SUFFIXES = [
  'sentry.io',
  'wixpress.com',
  'cloudflare.com',
  'gstatic.com',
] as const
