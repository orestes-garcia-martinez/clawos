export const SCRAPECLAW_DEFAULT_USER_AGENT = 'ClawOS-ScrapeClaw/0.1 (+https://clawoshq.com)'
export const SCRAPECLAW_DEFAULT_MAX_CANDIDATES = 10
export const SCRAPECLAW_DEFAULT_MAX_PAGES_PER_BUSINESS = 6
export const SCRAPECLAW_DEFAULT_FETCH_TIMEOUT_MS = 8_000

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

// TODO: LOCAL_MARKET_TERMS is hardcoded to the Clay County FL pilot market.
// When adding new markets, derive locality terms from the marketCity/marketRegion
// input rather than matching against this fixed list.
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
