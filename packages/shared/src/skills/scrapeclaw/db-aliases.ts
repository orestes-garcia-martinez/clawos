// ─────────────────────────────────────────────────────────────────────────────
// ScrapeClaw DB row aliases — type shortcuts for ScrapeClaw Supabase tables.
//
// These aliases provide ergonomic access to the auto-generated database types
// for ScrapeClaw-specific tables (businesses, prospects, evidence items,
// demo packages, package attachments, outbound drafts).
// ─────────────────────────────────────────────────────────────────────────────

import type { Database } from '../../types/database.types.js'

export type ScrapeClawBusinessRow = Database['public']['Tables']['scrapeclaw_businesses']['Row']
export type ScrapeClawBusinessInsert =
  Database['public']['Tables']['scrapeclaw_businesses']['Insert']
export type ScrapeClawBusinessUpdate =
  Database['public']['Tables']['scrapeclaw_businesses']['Update']

export type ScrapeClawProspectRow = Database['public']['Tables']['scrapeclaw_prospects']['Row']
export type ScrapeClawProspectInsert =
  Database['public']['Tables']['scrapeclaw_prospects']['Insert']
export type ScrapeClawProspectUpdate =
  Database['public']['Tables']['scrapeclaw_prospects']['Update']

export type ScrapeClawEvidenceItemRow =
  Database['public']['Tables']['scrapeclaw_evidence_items']['Row']
export type ScrapeClawEvidenceItemInsert =
  Database['public']['Tables']['scrapeclaw_evidence_items']['Insert']

export type ScrapeClawDemoPackageRow =
  Database['public']['Tables']['scrapeclaw_demo_packages']['Row']
export type ScrapeClawDemoPackageInsert =
  Database['public']['Tables']['scrapeclaw_demo_packages']['Insert']
export type ScrapeClawDemoPackageUpdate =
  Database['public']['Tables']['scrapeclaw_demo_packages']['Update']

export type ScrapeClawPackageAttachmentRow =
  Database['public']['Tables']['scrapeclaw_package_attachments']['Row']
export type ScrapeClawPackageAttachmentInsert =
  Database['public']['Tables']['scrapeclaw_package_attachments']['Insert']

export type ScrapeClawOutboundDraftRow =
  Database['public']['Tables']['scrapeclaw_outbound_drafts']['Row']
export type ScrapeClawOutboundDraftInsert =
  Database['public']['Tables']['scrapeclaw_outbound_drafts']['Insert']
export type ScrapeClawOutboundDraftUpdate =
  Database['public']['Tables']['scrapeclaw_outbound_drafts']['Update']
