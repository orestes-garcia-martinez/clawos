/**
 * Backward-compatible re-export.
 *
 * The worker now dispatches through apps/worker/src/skills/careerclaw/adapter.ts.
 * Keep this file temporarily so older imports do not break during the refactor.
 */

export {
  CareerClawCliBridgeError as CareerClawCliError,
  runCareerClawCliBridge as runCareerClawCli,
  type CareerClawCliBridgeResult as CareerClawCliResult,
} from './skills/careerclaw/cli-bridge.js'
