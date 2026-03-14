-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260310000003_link_tokens.sql
--
-- Stores short-lived tokens for the Telegram-to-Web account claim flow.
-- Flow:
--   1. Web app generates a 32-byte random token, computes
--      HMAC-SHA256(LINK_TOKEN_SECRET, token) = token_hash, and inserts a row.
--   2. User sends /link <token> to the Telegram bot.
--   3. Bot computes the same hash and runs:
--        DELETE FROM link_tokens
--        WHERE token_hash = $hash AND expires_at > now()
--        RETURNING web_user_id
--      A single atomic DELETE+RETURNING prevents double-use.
--   4. On success: bot merges the Telegram channel_identities row to web_user_id.
--   5. On failure (no row): expired or invalid token.
--
-- Security notes:
--   - token_hash is stored, never the raw token. The raw token travels only
--     in-app (Web UI) and in the Telegram /link command. It is never persisted.
--   - expires_at is 10 minutes from creation (enforced by the application).
--   - The token is single-use: DELETE is atomic. Concurrent /link attempts
--     against the same hash will get no RETURNING row after the first delete.
--   - Only the service role accesses this table (Web server + Telegram bot).
--     No user-facing RLS policies are needed; service role bypasses RLS.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.link_tokens (
  id          uuid        primary key default gen_random_uuid(),
  -- HMAC-SHA256 hex digest of the raw token. Raw token is never stored.
  token_hash  text        not null unique
                          check (char_length(token_hash) = 64),
  -- The web-authed Supabase user who initiated the link flow.
  web_user_id uuid        not null references public.users (id) on delete cascade,
  -- 10-minute TTL enforced at creation time by the application.
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- Index for fast lookups by token_hash.
-- The expiry filter (expires_at > now()) is applied in the query, not here --
-- partial index predicates require IMMUTABLE functions and now() is STABLE.
create index link_tokens_hash_idx
  on public.link_tokens (token_hash);

-- RLS: enabled. No user-facing policies — service role only.
-- Web server and Telegram bot both use SUPABASE_SERVICE_ROLE_KEY which
-- bypasses RLS entirely. RLS is still enabled as defense-in-depth.
alter table public.link_tokens enable row level security;

-- Scheduled cleanup: expire old tokens. Run via pg_cron or a cron job.
-- DELETE FROM public.link_tokens WHERE expires_at < now();
-- No migration needed — application can handle cleanup on access.
