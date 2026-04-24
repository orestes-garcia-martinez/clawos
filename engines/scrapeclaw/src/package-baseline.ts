// ─────────────────────────────────────────────────────────────────────────────
// ScrapeClaw — Phase 5 — Client baseline & dimension catalog.
//
// The client baseline is the "us" side of the Competitive Matrix. Phase 5
// uses a hardcoded wedge baseline for Clay County, FL residential property
// management (operator decision). When ClawOS adds multi-tenant operator
// profiles, replace with a lookup.
//
// The dimension catalog defines which gaps we look for and how they score.
// Keeping it here (not scattered across the analyzer) makes the threat
// weighting easy to audit and change.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScrapeClawActionHook, ScrapeClawClientBaseline } from '@clawos/shared'

// ── Client baseline (Clay County residential PM) ────────────────────────────

export const CLAY_COUNTY_RESIDENTIAL_PM_BASELINE: ScrapeClawClientBaseline = Object.freeze({
  wedgeSlug: 'residential_property_management',
  region: 'Clay County, FL',
  managementFeePercent: 10,
  leasingFeePercent: 100,
  maintenanceHoursLabel: '9am–5pm weekdays',
  responseTimeLabel: '24-hour response',
  offeredServices: Object.freeze([
    'tenant placement',
    'rent collection',
    'lease administration',
    'property inspections',
    'maintenance coordination',
  ]),
})

// ── Dimension catalog ────────────────────────────────────────────────────────

/**
 * One dimension = one row in the Competitive Matrix. The analyzer runs
 * exactly these checks in this order (order determines both insight id
 * ordering and determinism of outputs).
 *
 * `threatWeightIfGap` is the contribution when the prospect creates a
 * competitive threat (i.e. they offer something the client doesn't, or
 * undercut on price). `threatWeightIfServiceGap` is the inverse weight when
 * the client is ahead but the dimension still has commercial implications.
 *
 * Per operator instruction, maintenance hours and response time are
 * weighted heavily — they are the primary drivers of the automation upsell.
 */
export interface ScrapeClawDimension {
  id: string
  dimension: string
  category: 'Pricing' | 'Operations' | 'Reachability' | 'Service Mix'
  /** Weight when prospect beats client on this dimension (differentiator). */
  threatWeightIfDifferentiator: number
  /** Weight when client beats prospect on this dimension (service_gap). */
  threatWeightIfServiceGap: number
  /** Default action hook for this dimension. May be downgraded if evidence is absent. */
  defaultActionHook: ScrapeClawActionHook
}

export const SCRAPECLAW_DIMENSION_CATALOG: readonly ScrapeClawDimension[] = Object.freeze([
  {
    id: 'management_fee',
    dimension: 'Management Fee',
    category: 'Pricing',
    threatWeightIfDifferentiator: 2,
    threatWeightIfServiceGap: 1,
    defaultActionHook: 'OUTBOUND_MARKET_SYNC',
  },
  {
    id: 'leasing_fee',
    dimension: 'Leasing Fee',
    category: 'Pricing',
    threatWeightIfDifferentiator: 2,
    threatWeightIfServiceGap: 1,
    defaultActionHook: 'OUTBOUND_MARKET_SYNC',
  },
  {
    id: 'maintenance_hours',
    dimension: 'Maintenance Hours',
    category: 'Operations',
    // Heavy weight per operator directive: this is the upsell driver.
    threatWeightIfDifferentiator: 4,
    threatWeightIfServiceGap: 2,
    defaultActionHook: 'INTERNAL_STATUS_TRIGGER',
  },
  {
    id: 'response_time',
    dimension: 'Response Time',
    category: 'Operations',
    // Heavy weight per operator directive: this is the upsell driver.
    threatWeightIfDifferentiator: 4,
    threatWeightIfServiceGap: 2,
    defaultActionHook: 'INBOUND_LEAD_INTAKE',
  },
  {
    id: 'public_contact_email',
    dimension: 'Public Business Email',
    category: 'Reachability',
    threatWeightIfDifferentiator: 1,
    threatWeightIfServiceGap: 1,
    defaultActionHook: 'INBOUND_LEAD_INTAKE',
  },
  {
    id: 'public_contact_phone',
    dimension: 'Public Business Phone',
    category: 'Reachability',
    threatWeightIfDifferentiator: 1,
    threatWeightIfServiceGap: 1,
    defaultActionHook: 'INBOUND_LEAD_INTAKE',
  },
  {
    id: 'service_mix',
    dimension: 'Service Coverage',
    category: 'Service Mix',
    threatWeightIfDifferentiator: 2,
    threatWeightIfServiceGap: 1,
    defaultActionHook: 'OUTBOUND_MARKET_SYNC',
  },
])

// ── Bands for the threat level mapping ──────────────────────────────────────

/**
 * Score → level bands. Kept here (not buried in the analyzer) so that
 * changing the cutoffs is a one-line edit with a matching test update.
 */
export const SCRAPECLAW_THREAT_BANDS = Object.freeze({
  /** score ≤ this → 'low' */
  lowMax: 2,
  /** score ≤ this → 'medium', otherwise 'high' */
  mediumMax: 5,
})
