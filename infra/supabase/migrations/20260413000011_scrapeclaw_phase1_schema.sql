-- ============================================================================
-- Migration: 20260413000011_scrapeclaw_phase1_schema.sql
-- ScrapeClaw phase 1 — shared contracts and persistence foundations
-- ============================================================================

create table if not exists public.scrapeclaw_businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) <= 300),
  canonical_website_url text check (canonical_website_url is null or char_length(canonical_website_url) <= 2000),
  source_url text check (source_url is null or char_length(source_url) <= 2000),
  business_type text check (business_type is null or char_length(business_type) <= 120),
  city text check (city is null or char_length(city) <= 120),
  state text check (state is null or char_length(state) <= 120),
  service_area_text text check (service_area_text is null or char_length(service_area_text) <= 500),
  niche_slug text not null default 'residential_property_management' check (char_length(niche_slug) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scrapeclaw_businesses_user_id_idx on public.scrapeclaw_businesses (user_id);
create index if not exists scrapeclaw_businesses_niche_slug_idx on public.scrapeclaw_businesses (niche_slug);

alter table public.scrapeclaw_businesses enable row level security;
create policy "Users can view their own ScrapeClaw businesses" on public.scrapeclaw_businesses for select using (auth.uid() = user_id);
create policy "Users can insert their own ScrapeClaw businesses" on public.scrapeclaw_businesses for insert with check (auth.uid() = user_id);
create policy "Users can update their own ScrapeClaw businesses" on public.scrapeclaw_businesses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own ScrapeClaw businesses" on public.scrapeclaw_businesses for delete using (auth.uid() = user_id);
create trigger scrapeclaw_businesses_updated_at before update on public.scrapeclaw_businesses for each row execute function public.set_updated_at();

create table if not exists public.scrapeclaw_prospects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  business_id uuid not null references public.scrapeclaw_businesses(id) on delete cascade,
  status text not null default 'discovered' check (status in ('discovered', 'qualified', 'disqualified', 'packaged', 'contacted', 'archived')),
  wedge_slug text not null default 'residential_property_management' check (char_length(wedge_slug) <= 120),
  market_city text check (market_city is null or char_length(market_city) <= 120),
  market_region text check (market_region is null or char_length(market_region) <= 120),
  fit_score numeric(6, 4) check (fit_score is null or (fit_score >= 0 and fit_score <= 1)),
  use_case_hypothesis text check (use_case_hypothesis is null or char_length(use_case_hypothesis) <= 2000),
  data_need_hypothesis text check (data_need_hypothesis is null or char_length(data_need_hypothesis) <= 2000),
  demo_type_recommendation text check (demo_type_recommendation is null or char_length(demo_type_recommendation) <= 120),
  outreach_angle text check (outreach_angle is null or char_length(outreach_angle) <= 1000),
  confidence_level text check (confidence_level is null or confidence_level in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, business_id)
);

create index if not exists scrapeclaw_prospects_user_id_status_idx on public.scrapeclaw_prospects (user_id, status);

alter table public.scrapeclaw_prospects enable row level security;
create policy "Users can view their own ScrapeClaw prospects" on public.scrapeclaw_prospects for select using (auth.uid() = user_id);
create policy "Users can insert their own ScrapeClaw prospects" on public.scrapeclaw_prospects for insert with check (auth.uid() = user_id);
create policy "Users can update their own ScrapeClaw prospects" on public.scrapeclaw_prospects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own ScrapeClaw prospects" on public.scrapeclaw_prospects for delete using (auth.uid() = user_id);
create trigger scrapeclaw_prospects_updated_at before update on public.scrapeclaw_prospects for each row execute function public.set_updated_at();

create table if not exists public.scrapeclaw_evidence_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  prospect_id uuid not null references public.scrapeclaw_prospects(id) on delete cascade,
  page_kind text not null check (page_kind in ('homepage', 'about', 'services', 'contact', 'niche_relevant', 'other')),
  source_url text not null check (char_length(source_url) <= 2000),
  observed_at timestamptz not null default now(),
  title text check (title is null or char_length(title) <= 300),
  snippet text check (snippet is null or char_length(snippet) <= 4000),
  extracted_facts jsonb not null default '{}'::jsonb,
  source_confidence text check (source_confidence is null or source_confidence in ('low', 'medium', 'high')),
  created_at timestamptz not null default now()
);

create index if not exists scrapeclaw_evidence_items_user_id_idx on public.scrapeclaw_evidence_items (user_id);
create index if not exists scrapeclaw_evidence_items_prospect_id_idx on public.scrapeclaw_evidence_items (prospect_id);

alter table public.scrapeclaw_evidence_items enable row level security;
create policy "Users can view their own ScrapeClaw evidence items" on public.scrapeclaw_evidence_items for select using (auth.uid() = user_id);
create policy "Users can insert their own ScrapeClaw evidence items" on public.scrapeclaw_evidence_items for insert with check (auth.uid() = user_id);
create policy "Users can update their own ScrapeClaw evidence items" on public.scrapeclaw_evidence_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own ScrapeClaw evidence items" on public.scrapeclaw_evidence_items for delete using (auth.uid() = user_id);

create table if not exists public.scrapeclaw_demo_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  prospect_id uuid not null references public.scrapeclaw_prospects(id) on delete cascade,
  status text not null default 'draft' check (status in ('generating', 'draft', 'approved', 'queued', 'sent', 'failed', 'archived', 'rejected')),
  template_slug text check (template_slug is null or char_length(template_slug) <= 120),
  summary_markdown text,
  manifest jsonb not null default '{}'::jsonb,
  evidence_references jsonb not null default '[]'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  schema_version text not null default '1.0',
  finalized_at timestamptz,
  approved_at timestamptz,
  queued_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scrapeclaw_demo_packages_user_id_status_idx on public.scrapeclaw_demo_packages (user_id, status);
create index if not exists scrapeclaw_demo_packages_prospect_id_idx on public.scrapeclaw_demo_packages (prospect_id);

alter table public.scrapeclaw_demo_packages enable row level security;
create policy "Users can view their own ScrapeClaw demo packages" on public.scrapeclaw_demo_packages for select using (auth.uid() = user_id);
create policy "Users can insert their own ScrapeClaw demo packages" on public.scrapeclaw_demo_packages for insert with check (auth.uid() = user_id);
create policy "Users can update their own ScrapeClaw demo packages" on public.scrapeclaw_demo_packages for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own ScrapeClaw demo packages" on public.scrapeclaw_demo_packages for delete using (auth.uid() = user_id);
create trigger scrapeclaw_demo_packages_updated_at before update on public.scrapeclaw_demo_packages for each row execute function public.set_updated_at();

create table if not exists public.scrapeclaw_package_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  package_id uuid not null references public.scrapeclaw_demo_packages(id) on delete cascade,
  kind text not null check (kind in ('csv', 'json', 'manifest', 'summary_pdf')),
  storage_path text not null check (char_length(storage_path) <= 1000),
  mime_type text not null check (char_length(mime_type) <= 255),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  sha256 text check (sha256 is null or char_length(sha256) = 64),
  row_count integer check (row_count is null or row_count >= 0),
  schema_version text not null default '1.0',
  created_at timestamptz not null default now(),
  unique (package_id, kind)
);

create index if not exists scrapeclaw_package_attachments_user_id_idx on public.scrapeclaw_package_attachments (user_id);

alter table public.scrapeclaw_package_attachments enable row level security;
create policy "Users can view their own ScrapeClaw package attachments" on public.scrapeclaw_package_attachments for select using (auth.uid() = user_id);
create policy "Users can insert their own ScrapeClaw package attachments" on public.scrapeclaw_package_attachments for insert with check (auth.uid() = user_id);
create policy "Users can update their own ScrapeClaw package attachments" on public.scrapeclaw_package_attachments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own ScrapeClaw package attachments" on public.scrapeclaw_package_attachments for delete using (auth.uid() = user_id);

create table if not exists public.scrapeclaw_outbound_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  prospect_id uuid not null references public.scrapeclaw_prospects(id) on delete cascade,
  package_id uuid not null references public.scrapeclaw_demo_packages(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'approved', 'queued', 'sent', 'failed', 'archived')),
  to_email text check (to_email is null or char_length(to_email) <= 320),
  cc_email text check (cc_email is null or char_length(cc_email) <= 320),
  subject text not null check (char_length(subject) <= 300),
  body_markdown text not null,
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists scrapeclaw_outbound_drafts_user_id_status_idx on public.scrapeclaw_outbound_drafts (user_id, status);

alter table public.scrapeclaw_outbound_drafts enable row level security;
create policy "Users can view their own ScrapeClaw outbound drafts" on public.scrapeclaw_outbound_drafts for select using (auth.uid() = user_id);
create policy "Users can insert their own ScrapeClaw outbound drafts" on public.scrapeclaw_outbound_drafts for insert with check (auth.uid() = user_id);
create policy "Users can update their own ScrapeClaw outbound drafts" on public.scrapeclaw_outbound_drafts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own ScrapeClaw outbound drafts" on public.scrapeclaw_outbound_drafts for delete using (auth.uid() = user_id);
create trigger scrapeclaw_outbound_drafts_updated_at before update on public.scrapeclaw_outbound_drafts for each row execute function public.set_updated_at();
