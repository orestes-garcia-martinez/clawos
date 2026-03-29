-- Migration: Add structured state column to sessions table.
--
-- The `state` column stores a JSONB scratchpad alongside the conversation
-- messages. It holds structured metadata that must survive message pruning:
-- briefing match indices, gap analysis results, and profile snapshots.
--
-- Follows the Google ADK pattern: messages are the conversation history,
-- state is the agent's working scratchpad.
--
-- RLS: inherits the existing sessions RLS policy — users access their own rows only.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS state jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.sessions.state IS
  'Structured session scratchpad (briefing matches, gap results, profile). '
  'Separate from messages — never pruned by message-count or token-budget logic.';
