import type {
  ScrapeClawBusinessInsert,
  ScrapeClawBusinessRow,
  ScrapeClawBusinessUpdate,
  ScrapeClawDiscoveryDiscardInsert,
  ScrapeClawDiscoveryDiscardReason,
  ScrapeClawDiscoveryDiscardRow,
  ScrapeClawDiscoveryProvider,
  TypedSupabaseClient,
} from '@clawos/shared'

export class ScrapeClawDiscoveryStore {
  constructor(private readonly supabase: TypedSupabaseClient) {}

  async findBusinessByPlaceId(
    userId: string,
    provider: ScrapeClawDiscoveryProvider,
    externalId: string,
  ): Promise<ScrapeClawBusinessRow | null> {
    const { data, error } = await this.supabase
      .from('scrapeclaw_businesses')
      .select('*')
      .eq('user_id', userId)
      .eq('discovery_provider', provider)
      .eq('discovery_external_id', externalId)
      .maybeSingle()

    if (error) throw error
    return data
  }

  async findBusinessByCanonicalWebsite(
    userId: string,
    canonicalWebsiteUrl: string,
  ): Promise<ScrapeClawBusinessRow | null> {
    const { data, error } = await this.supabase
      .from('scrapeclaw_businesses')
      .select('*')
      .eq('user_id', userId)
      .eq('canonical_website_url', canonicalWebsiteUrl)
      .maybeSingle()

    if (error) throw error
    return data
  }

  async findDiscard(
    userId: string,
    provider: ScrapeClawDiscoveryProvider,
    externalId: string,
  ): Promise<ScrapeClawDiscoveryDiscardRow | null> {
    const { data, error } = await this.supabase
      .from('scrapeclaw_discovery_discards')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('external_id', externalId)
      .maybeSingle()

    if (error) throw error
    return data
  }

  async insertBusiness(payload: ScrapeClawBusinessInsert): Promise<ScrapeClawBusinessRow> {
    const { data, error } = await this.supabase
      .from('scrapeclaw_businesses')
      .insert(payload)
      .select('*')
      .single()

    if (error) throw error
    return data
  }

  async mergeBusinessMetadata(
    businessId: string,
    userId: string,
    patch: ScrapeClawBusinessUpdate,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('scrapeclaw_businesses')
      .update(patch)
      .eq('id', businessId)
      .eq('user_id', userId)

    if (error) throw error
  }

  async upsertDiscard(payload: ScrapeClawDiscoveryDiscardInsert): Promise<void> {
    const { error } = await this.supabase.from('scrapeclaw_discovery_discards').upsert(payload, {
      onConflict: 'user_id,provider,external_id',
    })

    if (error) throw error
  }
}

export function buildDiscardInsert(params: {
  userId: string
  provider: ScrapeClawDiscoveryProvider
  externalId: string
  reason: ScrapeClawDiscoveryDiscardReason
  linkedBusinessId?: string | null
  metadata?: Record<string, unknown>
}): ScrapeClawDiscoveryDiscardInsert {
  return {
    user_id: params.userId,
    provider: params.provider,
    external_id: params.externalId,
    reason: params.reason,
    linked_business_id: params.linkedBusinessId ?? null,
    metadata: (params.metadata ?? {}) as ScrapeClawDiscoveryDiscardInsert['metadata'],
  }
}
