/**
 * identity.ts -- Telegram user identity resolution.
 *
 * Maps a Telegram user ID to a canonical Supabase Auth UUID via the
 * channel_identities table. Creates a new Supabase user on first contact.
 *
 * Design notes:
 *   - Uses a synthetic placeholder email: tg_<id>@clawos.internal
 *     This is a backend-only identity, never exposed in product UX.
 *     Transactional email must never be sent to @clawos.internal addresses.
 *   - The handle_new_user trigger auto-creates the users row after auth user
 *     creation, so we don't insert into users directly.
 *   - Service role client used throughout -- bypasses RLS for identity ops.
 *   - Handles concurrent first-message race: if createUser or insert fails
 *     with a uniqueness conflict, we re-query rather than hard-failing.
 */

import { createServerClient } from '@clawos/shared'

/**
 * Resolve the Supabase UUID for a Telegram user, creating one on first contact.
 *
 * @param telegramUserId  Telegram numeric user ID as a string.
 * @returns               Supabase Auth UUID.
 */
export async function resolveOrCreateTelegramUser(telegramUserId: string): Promise<string> {
  const supabase = createServerClient()

  // 1. Fast path: existing channel_identities row
  const { data: existing } = await supabase
    .from('channel_identities')
    .select('user_id')
    .eq('channel', 'telegram')
    .eq('channel_user_id', telegramUserId)
    .maybeSingle()

  if (existing) return existing.user_id

  // 2. New user: create auth.users row
  // Synthetic email is internal-only -- never a real login surface.
  const syntheticEmail = `tg_${telegramUserId}@clawos.internal`

  const { data: authData, error: createError } = await supabase.auth.admin.createUser({
    email: syntheticEmail,
    email_confirm: true,
    user_metadata: {
      channel: 'telegram',
      telegram_user_id: telegramUserId,
    },
  })

  if (createError) {
    // Recovery: concurrent request may have already created this user.
    // Re-query channel_identities first (cheaper than auth lookup).
    const { data: retry } = await supabase
      .from('channel_identities')
      .select('user_id')
      .eq('channel', 'telegram')
      .eq('channel_user_id', telegramUserId)
      .maybeSingle()

    if (retry) return retry.user_id

    throw new Error(
      `[identity] Failed to create auth user for telegram:${telegramUserId}: ${createError.message}`,
    )
  }

  const userId = authData.user.id

  // 3. Create channel_identities row.
  // handle_new_user trigger has already created the users row.
  const { error: insertError } = await supabase
    .from('channel_identities')
    .insert({ user_id: userId, channel: 'telegram', channel_user_id: telegramUserId })

  if (insertError) {
    if (insertError.code === '23505') {
      // Unique constraint violated -- concurrent creation. Re-query.
      const { data: retry } = await supabase
        .from('channel_identities')
        .select('user_id')
        .eq('channel', 'telegram')
        .eq('channel_user_id', telegramUserId)
        .maybeSingle()

      if (retry) return retry.user_id
    }

    throw new Error(
      `[identity] Failed to create channel_identities for telegram:${telegramUserId}: ${insertError.message}`,
    )
  }

  return userId
}
