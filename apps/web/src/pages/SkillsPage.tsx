/**
 * SkillsPage.tsx — ClawOS standalone skill catalog.
 *
 * Full-page route at /skills. Rendered outside AppShell — no sidebar,
 * no topbar — so the catalog has full visual focus.
 *
 * Accessible from:
 *   - Sidebar "+ Add Skills" button  (navigates here instead of opening drawer)
 *   - "Browse all skills" CTA on /home
 *
 * Install flow: SkillCard "Install" → installSkill() → navigate to workspace.
 * Already-installed skills render with an "Installed" badge and no CTA.
 *
 * Auth: protected by AuthGuard in App.tsx (same as all other routes).
 */

import type { JSX } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClawLogo } from '../shell/icons.tsx'
import { useSkills } from '../context/SkillsContext.tsx'
import { SKILLS } from '../skills'
import type { SkillKey } from '../skills'
import { SkillCard } from '../components/SkillCard.tsx'

export function SkillsPage(): JSX.Element {
  const { installedSlugs, installSkill } = useSkills()
  const navigate = useNavigate()
  const [installingSlug, setInstallingSlug] = useState<SkillKey | null>(null)

  async function handleInstall(slug: SkillKey): Promise<void> {
    if (installingSlug) return
    setInstallingSlug(slug)
    await installSkill(slug)
    setInstallingSlug(null)
    navigate(`/${slug}/chat`, { replace: true })
  }

  // Split into installable and already-installed for the UI
  const available = SKILLS.filter((s) => !installedSlugs.includes(s.key))
  const installed = SKILLS.filter((s) => installedSlugs.includes(s.key))

  return (
    <>
      <style>{`
        @keyframes clawos-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .sp-in {
          opacity: 0;
          animation: clawos-fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>

      <div className="min-h-screen bg-bg text-text font-sans">
        <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
          {/* ── Header ──────────────────────────────────────────────────── */}
          <header
            className="sp-in flex items-center justify-between"
            style={{ animationDelay: '0ms' }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 rounded-xl text-text-muted hover:text-text hover:bg-surface-2 transition-all duration-150"
                aria-label="Go back"
              >
                {/* Left arrow */}
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              <div className="flex items-center gap-2.5">
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-xl text-accent"
                  style={{
                    background: 'var(--accent-dim)',
                    border: '1px solid var(--accent-border)',
                  }}
                >
                  <ClawLogo className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-display font-bold text-sm text-text leading-none">
                    Skill Catalog
                  </span>
                  <p className="text-[10px] font-mono text-text-muted mt-0.5 uppercase tracking-wider">
                    First-party only
                  </p>
                </div>
              </div>
            </div>
          </header>

          {/* ── Page title ──────────────────────────────────────────────── */}
          <section className="sp-in" style={{ animationDelay: '40ms' }}>
            <h1 className="font-display font-bold text-2xl tracking-tight mb-1">Add a skill</h1>
            <p className="text-sm text-text-dim leading-relaxed">
              Each skill is a purpose-built AI engine — tested, production-grade, and delivered over
              your preferred channel.
            </p>
          </section>

          {/* ── Available skills ─────────────────────────────────────────── */}
          {available.length > 0 && (
            <section
              className="sp-in space-y-4"
              style={{ animationDelay: '80ms' }}
              aria-label="Available skills"
            >
              <h2 className="text-[11px] font-mono font-semibold text-text-muted uppercase tracking-widest">
                Available
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {available.map((skill, i) => (
                  <div
                    key={skill.key}
                    className="sp-in"
                    style={{ animationDelay: `${120 + i * 60}ms` }}
                  >
                    <SkillCard
                      skillKey={skill.key}
                      onInstall={handleInstall}
                      isInstalling={installingSlug === skill.key}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Already installed ────────────────────────────────────────── */}
          {installed.length > 0 && (
            <section
              className="sp-in space-y-4"
              style={{ animationDelay: '200ms' }}
              aria-label="Installed skills"
            >
              <h2 className="text-[11px] font-mono font-semibold text-text-muted uppercase tracking-widest">
                Installed
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {installed.map((skill, i) => (
                  <div
                    key={skill.key}
                    className="sp-in"
                    style={{ animationDelay: `${240 + i * 60}ms` }}
                  >
                    {/* Installed skill — open workspace instead of install */}
                    <article
                      className="relative flex flex-col rounded-2xl p-5 opacity-60"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        boxShadow: 'inset 3px 0 0 var(--accent)',
                      }}
                    >
                      <header className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                            style={{
                              background: 'var(--accent-dim)',
                              border: '1px solid var(--accent-border)',
                              color: 'var(--accent)',
                            }}
                          >
                            {/* Checkmark for installed */}
                            <svg
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="w-4 h-4"
                              aria-hidden="true"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                          <h3 className="font-display font-bold text-sm text-text">{skill.name}</h3>
                        </div>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                          style={{
                            background: 'var(--accent-dim)',
                            color: 'var(--accent)',
                            border: '1px solid var(--accent-border)',
                          }}
                        >
                          Installed
                        </span>
                      </header>

                      <button
                        onClick={() => navigate(`/${skill.key}/chat`)}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold border transition-all duration-150 hover:bg-surface-2 text-text-muted mt-auto"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        Open workspace →
                      </button>
                    </article>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── All skills installed state ───────────────────────────────── */}
          {available.length === 0 && installed.length > 0 && (
            <div className="sp-in text-center py-8" style={{ animationDelay: '120ms' }}>
              <p className="text-sm text-text-muted">
                You have every available skill installed. More coming soon.
              </p>
            </div>
          )}

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <footer
            className="sp-in flex items-center justify-between pt-2 pb-8 text-[11px] font-mono text-text-muted"
            style={{ animationDelay: '280ms' }}
          >
            <span>© {new Date().getFullYear()} ClawOS</span>
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
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
