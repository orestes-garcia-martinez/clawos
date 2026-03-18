/**
 * HomePage.tsx — ClawOS zero-state landing page.
 *
 * Shown inside AppShell at /home when the user has no skills installed.
 * When skills are installed the router sends the user to their last skill
 * workspace — this page is not shown to returning users.
 *
 * Main content: three platform advantage cards drawn from the Core Principles
 * (owned distribution, tested engines, multi-channel). Skill discovery lives
 * on the dedicated /skills page, reached via "Browse all skills →".
 *
 * Outlet context: AppShell passes { onOpenAddSkills: () => navigate('/skills') }
 * so the CTA works without this page knowing about the router directly.
 */

import type { JSX } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'

// ── Outlet context (matches AppShell's Outlet context prop) ─────────────────

interface ShellOutletContext {
  onOpenAddSkills: () => void
}

// ── Platform advantage card data ────────────────────────────────────────────
// Extracted from Platform Strategy v1.7 — Core Principles and Platform Vision.

interface AdvantageCard {
  id: string
  icon: JSX.Element
  title: string
  body: string
  tag: string
}

const ADVANTAGES: AdvantageCard[] = [
  {
    id: 'owned-distribution',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden="true">
        <path
          d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    title: 'Owned Distribution',
    body: 'ClawOS controls its own install surface. No dependency on third-party agent marketplaces — your skills, your channel, your data.',
    tag: 'No marketplace risk',
  },
  {
    id: 'tested-engines',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden="true">
        <path
          d="M9 12l2 2 4-4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
    title: 'Production-Grade Engines',
    body: 'Business logic lives in independently tested npm packages with CI — not in prompt files. CareerClaw ships with 246 passing tests.',
    tag: '246 tests · CI on every commit',
  },
  {
    id: 'multi-channel',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M7 8h2M11 8h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M7 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Multi-Channel by Design',
    body: 'Web and Telegram at launch. WhatsApp in Phase 2. One agent layer, every channel — context and history travel with you.',
    tag: 'Web · Telegram · WhatsApp',
  },
]

// ── Platform advantage card ─────────────────────────────────────────────────

function AdvantageCard({ card }: { card: AdvantageCard }): JSX.Element {
  return (
    <article
      className="relative flex flex-col rounded-2xl p-5 h-full"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Icon */}
      <div
        className="flex items-center justify-center w-10 h-10 rounded-xl mb-4 shrink-0"
        style={{
          background: 'var(--accent-dim)',
          border: '1px solid var(--accent-border)',
          color: 'var(--accent)',
        }}
      >
        {card.icon}
      </div>

      {/* Title */}
      <h3 className="font-display font-bold text-sm text-text mb-2 leading-tight">{card.title}</h3>

      {/* Body */}
      <p className="text-sm text-text-dim leading-relaxed flex-1 mb-4">{card.body}</p>

      {/* Tag */}
      <span
        className="self-start inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono text-text-muted"
        style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
      >
        {card.tag}
      </span>
    </article>
  )
}

// ── HomePage ────────────────────────────────────────────────────────────────

export function HomePage(): JSX.Element {
  const { onOpenAddSkills } = useOutletContext<ShellOutletContext>()
  const { tier } = useAuth()
  const navigate = useNavigate()

  return (
    <>
      <style>{`
        @keyframes clawos-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hp-in {
          opacity: 0;
          animation: clawos-fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-12 space-y-12">
          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <section className="hp-in" style={{ animationDelay: '0ms' }}>
            <h1
              className="font-display font-bold text-[2.2rem] leading-[1.1] tracking-tight mb-4"
              style={{ color: 'var(--accent)' }}
            >
              Personal AI operating
              <br />
              system for professionals.
            </h1>
            <p className="text-text-dim text-base leading-relaxed max-w-lg mb-6">
              One account. One billing relationship. Access to all Claw skills through whichever
              channel you prefer — the agent is always on, always context-aware.
            </p>

            <button
              onClick={onOpenAddSkills}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-dim)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-3)'
                e.currentTarget.style.color = 'var(--text)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--surface-2)'
                e.currentTarget.style.color = 'var(--text-dim)'
              }}
            >
              Browse all skills →
            </button>
          </section>

          {/* ── Platform advantages ───────────────────────────────────────── */}
          <section
            className="hp-in space-y-4"
            style={{ animationDelay: '80ms' }}
            aria-label="Platform advantages"
          >
            <h2 className="text-[11px] font-mono font-semibold text-text-muted uppercase tracking-widest">
              Why ClawOS
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
              {ADVANTAGES.map((card, i) => (
                <div
                  key={card.id}
                  className="hp-in h-full"
                  style={{ animationDelay: `${120 + i * 70}ms` }}
                >
                  <AdvantageCard card={card} />
                </div>
              ))}
            </div>
          </section>

          {/* ── Go Pro — free tier only ───────────────────────────────────── */}
          {tier === 'free' && (
            <section
              className="hp-in rounded-2xl p-6 space-y-4"
              style={{
                animationDelay: '340ms',
                background: 'linear-gradient(135deg, var(--accent-2-dim), var(--accent-dim))',
                border: '1px solid var(--accent-border)',
              }}
            >
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="font-display font-bold text-base text-text">Go Pro</span>
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--accent-dim)',
                      color: 'var(--accent)',
                      border: '1px solid var(--accent-border)',
                    }}
                  >
                    $9 / mo
                  </span>
                </div>
                <p className="text-sm text-text-dim leading-relaxed max-w-lg">
                  Unlock LLM-powered outreach, cover letter generation, resume gap analysis, and
                  higher usage limits across all installed skills.
                </p>
              </div>
              <button
                onClick={() => navigate('/settings')}
                className="px-5 py-2.5 rounded-xl font-semibold text-sm bg-accent text-bg hover:brightness-110 active:scale-95 transition-all duration-150"
              >
                Upgrade now
              </button>
            </section>
          )}

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <footer
            className="hp-in flex items-center justify-between pt-2 pb-8"
            style={{ animationDelay: '380ms' }}
          >
            <span className="text-[11px] font-mono text-text-muted">
              © {new Date().getFullYear()} ClawOS
            </span>
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono text-text-muted"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-success" aria-hidden="true" />
              First-party skills only
            </div>
          </footer>
        </div>
      </div>
    </>
  )
}
