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
