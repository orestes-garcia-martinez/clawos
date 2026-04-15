export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.1'
  }
  public: {
    Tables: {
      billing_webhook_events: {
        Row: {
          error: string | null
          event_id: string
          event_type: string
          payload: Json | null
          processed_at: string | null
          received_at: string
          status: string
        }
        Insert: {
          error?: string | null
          event_id: string
          event_type: string
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
          status: string
        }
        Update: {
          error?: string | null
          event_id?: string
          event_type?: string
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      careerclaw_job_tracking: {
        Row: {
          company: string
          created_at: string
          id: string
          job_id: string
          notes: string | null
          status: string
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          company: string
          created_at?: string
          id?: string
          job_id: string
          notes?: string | null
          status?: string
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          company?: string
          created_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'careerclaw_job_tracking_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      careerclaw_profiles: {
        Row: {
          created_at: string
          experience_years: number | null
          id: string
          location_pref: string | null
          location_radius_mi: number | null
          resume_summary: string | null
          resume_text: string | null
          resume_uploaded_at: string | null
          salary_min: number | null
          skills: string[] | null
          target_roles: string[] | null
          updated_at: string
          user_id: string
          work_mode: string | null
        }
        Insert: {
          created_at?: string
          experience_years?: number | null
          id?: string
          location_pref?: string | null
          location_radius_mi?: number | null
          resume_summary?: string | null
          resume_text?: string | null
          resume_uploaded_at?: string | null
          salary_min?: number | null
          skills?: string[] | null
          target_roles?: string[] | null
          updated_at?: string
          user_id: string
          work_mode?: string | null
        }
        Update: {
          created_at?: string
          experience_years?: number | null
          id?: string
          location_pref?: string | null
          location_radius_mi?: number | null
          resume_summary?: string | null
          resume_text?: string | null
          resume_uploaded_at?: string | null
          salary_min?: number | null
          skills?: string[] | null
          target_roles?: string[] | null
          updated_at?: string
          user_id?: string
          work_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'careerclaw_profiles_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      careerclaw_runs: {
        Row: {
          duration_ms: number | null
          id: string
          job_count: number
          run_at: string
          status: string
          top_score: number | null
          user_id: string
        }
        Insert: {
          duration_ms?: number | null
          id?: string
          job_count?: number
          run_at?: string
          status: string
          top_score?: number | null
          user_id: string
        }
        Update: {
          duration_ms?: number | null
          id?: string
          job_count?: number
          run_at?: string
          status?: string
          top_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'careerclaw_runs_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      channel_identities: {
        Row: {
          channel: string
          channel_user_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          channel: string
          channel_user_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          channel?: string
          channel_user_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'channel_identities_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      link_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          web_user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          web_user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          web_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'link_tokens_web_user_id_fkey'
            columns: ['web_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      scrapeclaw_businesses: {
        Row: {
          business_type: string | null
          canonical_website_url: string | null
          city: string | null
          created_at: string
          discovered_at: string
          discovery_external_id: string | null
          discovery_provider: string | null
          discovery_query: string | null
          formatted_address: string | null
          id: string
          name: string
          niche_slug: string
          service_area_text: string | null
          source_url: string | null
          state: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_type?: string | null
          canonical_website_url?: string | null
          city?: string | null
          created_at?: string
          discovered_at?: string
          discovery_external_id?: string | null
          discovery_provider?: string | null
          discovery_query?: string | null
          formatted_address?: string | null
          id?: string
          name: string
          niche_slug?: string
          service_area_text?: string | null
          source_url?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_type?: string | null
          canonical_website_url?: string | null
          city?: string | null
          created_at?: string
          discovered_at?: string
          discovery_external_id?: string | null
          discovery_provider?: string | null
          discovery_query?: string | null
          formatted_address?: string | null
          id?: string
          name?: string
          niche_slug?: string
          service_area_text?: string | null
          source_url?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'scrapeclaw_businesses_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      scrapeclaw_discovery_discards: {
        Row: {
          created_at: string
          external_id: string
          id: string
          linked_business_id: string | null
          metadata: Json
          provider: string
          reason: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          linked_business_id?: string | null
          metadata?: Json
          provider: string
          reason: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          linked_business_id?: string | null
          metadata?: Json
          provider?: string
          reason?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'scrapeclaw_discovery_discards_linked_business_id_fkey'
            columns: ['linked_business_id']
            isOneToOne: false
            referencedRelation: 'scrapeclaw_businesses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'scrapeclaw_discovery_discards_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }

      scrapeclaw_demo_packages: {
        Row: {
          approved_at: string | null
          archived_at: string | null
          created_at: string
          evidence_references: Json
          failed_at: string | null
          finalized_at: string | null
          id: string
          manifest: Json
          prospect_id: string
          queued_at: string | null
          schema_version: string
          sent_at: string | null
          status: string
          summary_markdown: string | null
          template_slug: string | null
          updated_at: string
          user_id: string
          validation_errors: Json
        }
        Insert: {
          approved_at?: string | null
          archived_at?: string | null
          created_at?: string
          evidence_references?: Json
          failed_at?: string | null
          finalized_at?: string | null
          id?: string
          manifest?: Json
          prospect_id: string
          queued_at?: string | null
          schema_version?: string
          sent_at?: string | null
          status?: string
          summary_markdown?: string | null
          template_slug?: string | null
          updated_at?: string
          user_id: string
          validation_errors?: Json
        }
        Update: {
          approved_at?: string | null
          archived_at?: string | null
          created_at?: string
          evidence_references?: Json
          failed_at?: string | null
          finalized_at?: string | null
          id?: string
          manifest?: Json
          prospect_id?: string
          queued_at?: string | null
          schema_version?: string
          sent_at?: string | null
          status?: string
          summary_markdown?: string | null
          template_slug?: string | null
          updated_at?: string
          user_id?: string
          validation_errors?: Json
        }
        Relationships: [
          {
            foreignKeyName: 'scrapeclaw_demo_packages_prospect_id_fkey'
            columns: ['prospect_id']
            isOneToOne: false
            referencedRelation: 'scrapeclaw_prospects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'scrapeclaw_demo_packages_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      scrapeclaw_evidence_items: {
        Row: {
          created_at: string
          extracted_facts: Json
          id: string
          observed_at: string
          page_kind: string
          prospect_id: string
          snippet: string | null
          source_confidence: string | null
          source_url: string
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          extracted_facts?: Json
          id?: string
          observed_at?: string
          page_kind: string
          prospect_id: string
          snippet?: string | null
          source_confidence?: string | null
          source_url: string
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          extracted_facts?: Json
          id?: string
          observed_at?: string
          page_kind?: string
          prospect_id?: string
          snippet?: string | null
          source_confidence?: string | null
          source_url?: string
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'scrapeclaw_evidence_items_prospect_id_fkey'
            columns: ['prospect_id']
            isOneToOne: false
            referencedRelation: 'scrapeclaw_prospects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'scrapeclaw_evidence_items_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      scrapeclaw_outbound_drafts: {
        Row: {
          body_markdown: string
          cc_email: string | null
          created_at: string
          id: string
          package_id: string
          prospect_id: string
          provider_message_id: string | null
          sent_at: string | null
          status: string
          subject: string
          to_email: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body_markdown: string
          cc_email?: string | null
          created_at?: string
          id?: string
          package_id: string
          prospect_id: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          to_email?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body_markdown?: string
          cc_email?: string | null
          created_at?: string
          id?: string
          package_id?: string
          prospect_id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          to_email?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'scrapeclaw_outbound_drafts_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'scrapeclaw_demo_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'scrapeclaw_outbound_drafts_prospect_id_fkey'
            columns: ['prospect_id']
            isOneToOne: false
            referencedRelation: 'scrapeclaw_prospects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'scrapeclaw_outbound_drafts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      scrapeclaw_package_attachments: {
        Row: {
          byte_size: number | null
          created_at: string
          id: string
          kind: string
          mime_type: string
          package_id: string
          row_count: number | null
          schema_version: string
          sha256: string | null
          storage_path: string
          user_id: string
        }
        Insert: {
          byte_size?: number | null
          created_at?: string
          id?: string
          kind: string
          mime_type: string
          package_id: string
          row_count?: number | null
          schema_version?: string
          sha256?: string | null
          storage_path: string
          user_id: string
        }
        Update: {
          byte_size?: number | null
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string
          package_id?: string
          row_count?: number | null
          schema_version?: string
          sha256?: string | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'scrapeclaw_package_attachments_package_id_fkey'
            columns: ['package_id']
            isOneToOne: false
            referencedRelation: 'scrapeclaw_demo_packages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'scrapeclaw_package_attachments_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      scrapeclaw_prospects: {
        Row: {
          business_id: string
          confidence_level: string | null
          created_at: string
          data_need_hypothesis: string | null
          demo_type_recommendation: string | null
          fit_score: number | null
          id: string
          market_city: string | null
          market_region: string | null
          outreach_angle: string | null
          status: string
          updated_at: string
          use_case_hypothesis: string | null
          user_id: string
          wedge_slug: string
        }
        Insert: {
          business_id: string
          confidence_level?: string | null
          created_at?: string
          data_need_hypothesis?: string | null
          demo_type_recommendation?: string | null
          fit_score?: number | null
          id?: string
          market_city?: string | null
          market_region?: string | null
          outreach_angle?: string | null
          status?: string
          updated_at?: string
          use_case_hypothesis?: string | null
          user_id: string
          wedge_slug?: string
        }
        Update: {
          business_id?: string
          confidence_level?: string | null
          created_at?: string
          data_need_hypothesis?: string | null
          demo_type_recommendation?: string | null
          fit_score?: number | null
          id?: string
          market_city?: string | null
          market_region?: string | null
          outreach_angle?: string | null
          status?: string
          updated_at?: string
          use_case_hypothesis?: string | null
          user_id?: string
          wedge_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: 'scrapeclaw_prospects_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'scrapeclaw_businesses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'scrapeclaw_prospects_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      sessions: {
        Row: {
          channel: string
          created_at: string
          deleted_at: string | null
          id: string
          last_active: string
          messages: Json
          state: Json
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_active?: string
          messages?: Json
          state?: Json
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_active?: string
          messages?: Json
          state?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sessions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      user_skill_entitlements: {
        Row: {
          id: string
          metadata: Json
          period_ends_at: string | null
          provider: string
          provider_customer_external_id: string | null
          provider_product_id: string | null
          provider_subscription_id: string | null
          skill_slug: string
          status: string
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          metadata?: Json
          period_ends_at?: string | null
          provider?: string
          provider_customer_external_id?: string | null
          provider_product_id?: string | null
          provider_subscription_id?: string | null
          skill_slug: string
          status?: string
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          metadata?: Json
          period_ends_at?: string | null
          provider?: string
          provider_customer_external_id?: string | null
          provider_product_id?: string | null
          provider_subscription_id?: string | null
          skill_slug?: string
          status?: string
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_skills: {
        Row: {
          created_at: string
          id: string
          installed_at: string
          is_default: boolean
          last_used_at: string | null
          skill_slug: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          installed_at?: string
          is_default?: boolean
          last_used_at?: string | null
          skill_slug: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          installed_at?: string
          is_default?: boolean
          last_used_at?: string | null
          skill_slug?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_skills_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          tier?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      refresh_user_tier: { Args: { p_user_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
