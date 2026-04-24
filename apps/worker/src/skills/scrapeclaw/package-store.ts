// ─────────────────────────────────────────────────────────────────────────────
// ScrapeClaw — Phase 5 — Package Supabase store.
//
// Narrow, RLS-safe data access for the package worker mode. Everything is
// scoped by `userId` explicitly in addition to relying on RLS, so any path
// that bypasses RLS (e.g. an internal admin sync) still cannot read across
// users by accident.
//
// Phase 5 does NOT upload artifact bytes to Supabase Storage. Attachment
// rows carry the logical storage path + sha256 + byte_size + row_count;
// the storage upload is Phase 6's job.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Json,
  ScrapeClawBusinessRow,
  ScrapeClawDemoPackageInsert,
  ScrapeClawDemoPackageRow,
  ScrapeClawDemoPackageUpdate,
  ScrapeClawEvidenceItemRow,
  ScrapeClawPackageAttachmentInsert,
  ScrapeClawPackageAttachmentRow,
  ScrapeClawProspectRow,
  TypedSupabaseClient,
} from '@clawos/shared'

export class ScrapeClawPackageStore {
  constructor(private readonly supabase: TypedSupabaseClient) {}

  async findProspect(userId: string, prospectId: string): Promise<ScrapeClawProspectRow | null> {
    const { data, error } = await this.supabase
      .from('scrapeclaw_prospects')
      .select('*')
      .eq('user_id', userId)
      .eq('id', prospectId)
      .maybeSingle()
    if (error) throw error
    return data
  }

  async findBusiness(userId: string, businessId: string): Promise<ScrapeClawBusinessRow | null> {
    const { data, error } = await this.supabase
      .from('scrapeclaw_businesses')
      .select('*')
      .eq('user_id', userId)
      .eq('id', businessId)
      .maybeSingle()
    if (error) throw error
    return data
  }

  async listEvidence(userId: string, prospectId: string): Promise<ScrapeClawEvidenceItemRow[]> {
    const { data, error } = await this.supabase
      .from('scrapeclaw_evidence_items')
      .select('*')
      .eq('user_id', userId)
      .eq('prospect_id', prospectId)
      .order('id', { ascending: true })
    if (error) throw error
    return data ?? []
  }

  async insertPackage(payload: ScrapeClawDemoPackageInsert): Promise<ScrapeClawDemoPackageRow> {
    const { data, error } = await this.supabase
      .from('scrapeclaw_demo_packages')
      .insert(payload)
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  async insertAttachments(
    payloads: ScrapeClawPackageAttachmentInsert[],
  ): Promise<ScrapeClawPackageAttachmentRow[]> {
    if (payloads.length === 0) return []
    const { data, error } = await this.supabase
      .from('scrapeclaw_package_attachments')
      .insert(payloads)
      .select('*')
    if (error) throw error
    return data ?? []
  }

  /**
   * Updates a generating package to draft with the finalized metadata:
   * summary markdown, artifact manifest, and evidence references. Used at
   * the end of a successful package run.
   */
  async finalizePackageAsDraft(params: {
    userId: string
    packageId: string
    summaryMarkdown: string
    manifest: Json
    evidenceReferences: Json
  }): Promise<void> {
    const patch: ScrapeClawDemoPackageUpdate = {
      status: 'draft',
      summary_markdown: params.summaryMarkdown,
      manifest: params.manifest,
      evidence_references: params.evidenceReferences,
    }
    const { error } = await this.supabase
      .from('scrapeclaw_demo_packages')
      .update(patch)
      .eq('user_id', params.userId)
      .eq('id', params.packageId)
    if (error) throw error
  }

  async markProspectPackaged(userId: string, prospectId: string): Promise<void> {
    const { error } = await this.supabase
      .from('scrapeclaw_prospects')
      .update({ status: 'packaged' })
      .eq('user_id', userId)
      .eq('id', prospectId)
    if (error) throw error
  }

  async markPackageFailed(userId: string, packageId: string): Promise<void> {
    const patch: ScrapeClawDemoPackageUpdate = { status: 'failed' }
    const { error } = await this.supabase
      .from('scrapeclaw_demo_packages')
      .update(patch)
      .eq('user_id', userId)
      .eq('id', packageId)
    if (error) throw error
  }
}
