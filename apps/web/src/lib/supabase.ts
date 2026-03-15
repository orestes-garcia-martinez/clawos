/**
 * supabase.ts — browser Supabase client.
 *
 * Uses import.meta.env (Vite) so VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 * are inlined at build time. createBrowserClient() from @clawos/shared uses
 * process.env which is not available in the browser bundle — hence this file.
 *
 * This is the only file in apps/web that instantiates a Supabase client.
 * Import `supabase` from here everywhere else.
 *
 * When VITE_MOCK=true, a fully in-memory mock is used instead — no real
 * Supabase project required.
 */

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clawos/shared'

const isMock = import.meta.env['VITE_MOCK'] === 'true'

let supabaseInstance: SupabaseClient<Database>

if (isMock) {
  const { supabase: mockClient } = await import('../mocks/supabase.mock.ts')
  supabaseInstance = mockClient as SupabaseClient<Database>
} else {
  const url = import.meta.env['VITE_SUPABASE_URL'] as string | undefined
  const key = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined

  if (!url || !key) {
    throw new Error(
      '[web] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
        'Copy apps/web/.env.example → apps/web/.env and fill in the values.',
    )
  }

  supabaseInstance = createClient<Database>(url, key)
}

export const supabase = supabaseInstance
