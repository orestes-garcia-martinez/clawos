/**
 * forensic-logger.test.ts — Unit tests for P0 forensic logger helpers.
 *
 * Coverage:
 *   - detectUserIntents: single intent, multiple intents, no intents
 *   - filterFalseClaims: claims backed by tools filtered out, unbacked kept
 *   - sanitizeHallucinatedClaims: lines stripped, corrective note appended
 *   - sanitizeFormatOutput integration (via chat.ts helper — tested indirectly)
 *   - detectFalseActionClaims: tracker_save, tracker_update, cover_letter_generated
 *
 * Run: npm test (from apps/api/) or turbo run test
 */

import { describe, it, expect } from 'vitest'
import {
  detectUserIntents,
  detectFalseActionClaims,
  filterFalseClaims,
  sanitizeHallucinatedClaims,
} from '../forensic-logger.js'

// ── detectUserIntents ────────────────────────────────────────────────────────

describe('detectUserIntents', () => {
  it('detects a single cover_letter intent', () => {
    expect(detectUserIntents('Write me a cover letter for the Breezy role')).toContain(
      'cover_letter',
    )
  })

  it('detects a single track_save intent', () => {
    expect(detectUserIntents('Save the job to my tracker')).toContain('track_save')
  })

  it('detects both cover_letter and track_save in one message', () => {
    const intents = detectUserIntents(
      'Write a cover letter for Level and save the job in my application tracker',
    )
    expect(intents).toContain('cover_letter')
    expect(intents).toContain('track_save')
  })

  it('detects gap_analysis intent', () => {
    expect(detectUserIntents('Analyze the Senior Frontend Engineer role')).toContain('gap_analysis')
  })

  it('detects briefing intent', () => {
    expect(detectUserIntents('Find me jobs')).toContain('briefing')
  })

  it('returns empty array for generic messages', () => {
    expect(detectUserIntents('How are you today?')).toEqual([])
  })

  it('detects gap_analysis intent for score follow-up questions', () => {
    expect(detectUserIntents('Why is the score low?')).toContain('gap_analysis')
  })
})

// ── detectFalseActionClaims ──────────────────────────────────────────────────

describe('detectFalseActionClaims', () => {
  it('detects tracker_save claim', () => {
    expect(detectFalseActionClaims('Done — Level is saved to your tracker.')).toContain(
      'tracker_save',
    )
  })

  it('detects tracker_save with "added to your applications"', () => {
    expect(detectFalseActionClaims('Added to your application tracker.')).toContain('tracker_save')
  })

  it('detects tracker_update claim', () => {
    expect(detectFalseActionClaims('The Stripe job is now marked as applied.')).toContain(
      'tracker_update',
    )
  })

  it('returns empty for clean text', () => {
    expect(detectFalseActionClaims('Want me to save this job to your tracker?')).toEqual([])
  })
})

// ── filterFalseClaims ────────────────────────────────────────────────────────

describe('filterFalseClaims', () => {
  it('keeps claims when no backing tool was invoked', () => {
    expect(filterFalseClaims(['tracker_save'], [])).toEqual(['tracker_save'])
  })

  it('keeps claims when wrong tool was invoked', () => {
    expect(filterFalseClaims(['tracker_save'], ['run_cover_letter'])).toEqual(['tracker_save'])
  })

  it('filters out claims backed by the correct tool', () => {
    expect(filterFalseClaims(['tracker_save'], ['track_application'])).toEqual([])
  })

  it('filters selectively with mixed claims', () => {
    const result = filterFalseClaims(
      ['tracker_save', 'cover_letter_generated'],
      ['run_cover_letter'],
    )
    // tracker_save is NOT backed by run_cover_letter → kept
    // cover_letter_generated IS backed by run_cover_letter → filtered
    expect(result).toEqual(['tracker_save'])
  })

  it('returns empty array when all claims are backed', () => {
    expect(filterFalseClaims(['tracker_save', 'tracker_update'], ['track_application'])).toEqual([])
  })
})

// ── sanitizeHallucinatedClaims ───────────────────────────────────────────────

describe('sanitizeHallucinatedClaims', () => {
  it('strips lines containing false tracker_save claims', () => {
    const text = [
      'Here is your cover letter for Level.',
      '',
      'Dear Level team...',
      '',
      'Done — Senior Frontend Engineer at Level is saved to your tracker.',
    ].join('\n')

    const { sanitized, stripped } = sanitizeHallucinatedClaims(text, ['tracker_save'])
    expect(stripped).toBe(true)
    expect(sanitized).not.toContain('saved to your tracker')
    expect(sanitized).toContain('Want me to save this job to your tracker? Just say the word.')
  })

  it('returns text unchanged when no false claims match lines', () => {
    const text = 'This is a clean response with no action claims.'
    const { sanitized, stripped } = sanitizeHallucinatedClaims(text, ['tracker_save'])
    expect(stripped).toBe(false)
    expect(sanitized).toBe(text)
  })

  it('returns text unchanged when falseClaims is empty', () => {
    const text = 'Done — Level is saved to your tracker.'
    const { sanitized, stripped } = sanitizeHallucinatedClaims(text, [])
    expect(stripped).toBe(false)
    expect(sanitized).toBe(text)
  })

  it('collapses excessive blank lines after stripping', () => {
    const text = [
      'Paragraph one.',
      '',
      '',
      'Done — Level is saved to your tracker.',
      '',
      '',
      'Paragraph two.',
    ].join('\n')

    const { sanitized } = sanitizeHallucinatedClaims(text, ['tracker_save'])
    // Should not have 3+ consecutive newlines
    expect(sanitized).not.toMatch(/\n{3,}/)
    expect(sanitized).toContain('Paragraph one.')
    expect(sanitized).toContain('Paragraph two.')
  })

  it('appends tracker_update corrective note', () => {
    const text = 'The job is now marked as applied.'
    const { sanitized, stripped } = sanitizeHallucinatedClaims(text, ['tracker_update'])
    expect(stripped).toBe(true)
    expect(sanitized).toContain('Want to update the status on this one? Just let me know.')
  })
})
