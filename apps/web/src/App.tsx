import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type Theme = 'dark' | 'light'
type NavId = 'chat' | 'jobs' | 'history' | 'settings'

interface Suggestion {
  label: string
  desc: string
  pro?: boolean
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function ClawLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 26" fill="none" className={className} aria-hidden="true">
      <path
        d="M6 24 C3.5 17 5 10 8 3"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M12 25 C10 18 11.5 11 12 3"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M18 24 C20.5 17 19 10 16 3"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

const Icon = {
  Chat: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path
        fillRule="evenodd"
        d="M2 5a2 2 0 012-2h12a2 2 0 012 2v6a2 2 0 01-2 2H6l-4 4V5z"
        clipRule="evenodd"
      />
    </svg>
  ),
  Jobs: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path
        fillRule="evenodd"
        d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.95 22.95 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z"
        clipRule="evenodd"
      />
    </svg>
  ),
  History: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
        clipRule="evenodd"
      />
    </svg>
  ),
  Settings: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path
        fillRule="evenodd"
        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
        clipRule="evenodd"
      />
    </svg>
  ),
  Sun: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path
        fillRule="evenodd"
        d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
        clipRule="evenodd"
      />
    </svg>
  ),
  Moon: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
    </svg>
  ),
  Menu: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path
        fillRule="evenodd"
        d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
        clipRule="evenodd"
      />
    </svg>
  ),
  Send: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
    </svg>
  ),
  Paperclip: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path
        fillRule="evenodd"
        d="M8 4a3 3 0 00-3 3v4.5a4.5 4.5 0 009 0V7a.75.75 0 011.5 0v4.5a6 6 0 11-12 0V7a4.5 4.5 0 019 0v4.5a1.5 1.5 0 003 0V7a3 3 0 00-3-3z"
        clipRule="evenodd"
      />
    </svg>
  ),
  X: () => (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  ),
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NAV: { id: NavId; label: string; IconComp: () => JSX.Element }[] = [
  { id: 'chat', label: 'Chat', IconComp: Icon.Chat },
  { id: 'jobs', label: 'Jobs', IconComp: Icon.Jobs },
  { id: 'history', label: 'History', IconComp: Icon.History },
  { id: 'settings', label: 'Settings', IconComp: Icon.Settings },
]

const SUGGESTIONS: Suggestion[] = [
  { label: "Run today's job briefing", desc: 'Fetch + score latest matches' },
  { label: 'Draft outreach for top match', desc: 'Resume-aware, LLM-crafted' },
  { label: 'Analyse my resume gaps', desc: 'Identify missing keywords', pro: true },
  { label: 'Find remote TypeScript roles', desc: 'Search across all sources' },
]

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('clawos-theme') as Theme) ?? 'dark'
    } catch {
      return 'dark'
    }
  })
  const [activeNav, setActiveNav] = useState<NavId>('chat')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync theme to DOM
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('clawos-theme', theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  // Close sidebar on resize to desktop
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false) }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return
    // TODO Chat 6: Wire to Agent API POST /chat with SSE streaming
    console.log('[web] Submit:', input)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [input])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="h-screen bg-bg text-text font-sans flex overflow-hidden">

      {/* ── Mobile backdrop ─────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={[
          'fixed lg:static inset-y-0 left-0 z-30',
          'w-64 shrink-0 bg-surface border-r border-border',
          'flex flex-col',
          'transition-transform duration-200 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
        aria-label="Navigation"
      >
        {/* Logo */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-accent">
              <ClawLogo className="w-7 h-7" />
            </div>
            <div>
              <div className="font-display font-bold text-lg leading-none tracking-tight">
                ClawOS
              </div>
              <div className="text-[10px] text-text-muted font-mono mt-0.5 tracking-wider uppercase">
                Career Intelligence
              </div>
            </div>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            aria-label="Close navigation"
          >
            <Icon.X />
          </button>
        </div>

        {/* Active skill pill */}
        <div className="px-4 py-2.5 border-b border-border-subtle">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
              aria-label="Active"
            />
            <span className="text-xs font-mono font-semibold text-accent">CareerClaw</span>
            <span className="ml-auto text-[10px] text-text-muted font-mono">v1.0.4</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5" aria-label="Main navigation">
          {NAV.map(({ id, label, IconComp }) => {
            const active = activeNav === id
            return (
              <button
                key={id}
                onClick={() => { setActiveNav(id); setSidebarOpen(false) }}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left',
                  'transition-all duration-150 group',
                  active
                    ? 'bg-accent-dim text-accent'
                    : 'text-text-muted hover:bg-surface-2 hover:text-text',
                ].join(' ')}
                aria-current={active ? 'page' : undefined}
              >
                <IconComp />
                <span className="font-medium">{label}</span>
                {active && (
                  <span className="ml-auto w-1 h-4 rounded-full bg-accent shrink-0" />
                )}
              </button>
            )
          })}
        </nav>

        {/* Pro upgrade card */}
        <div className="px-3 pb-3">
          <div
            className="p-4 rounded-2xl space-y-3"
            style={{
              background: 'linear-gradient(135deg, var(--accent-2-dim), var(--accent-dim))',
              border: '1px solid var(--accent-border)',
            }}
          >
            <div>
              <div className="text-sm font-semibold font-display">Go Pro · $9/mo</div>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                LLM outreach, cover letters, resume gap analysis.
              </p>
            </div>
            <button className="w-full py-2 rounded-xl bg-accent text-bg text-xs font-bold hover:brightness-110 active:scale-95 transition-all">
              Upgrade now
            </button>
          </div>
        </div>

        {/* User + theme toggle */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center text-xs font-bold font-mono text-text-muted shrink-0">
              U
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">Free Plan</div>
            </div>
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-all"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Icon.Sun /> : <Icon.Moon />}
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center px-4 gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-all"
            aria-label="Open navigation"
          >
            <Icon.Menu />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-text-muted">
              <ClawLogo className="w-4 h-4" />
            </span>
            <span className="font-display font-semibold text-sm">
              {activeNav.charAt(0).toUpperCase() + activeNav.slice(1)}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-border text-[11px] font-mono text-text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-success" aria-hidden="true" />
              Scaffold · Chat 1
            </div>
          </div>
        </header>

        {/* ── Chat area ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="h-full flex flex-col items-center justify-center px-4 sm:px-8 py-12">
            <div className="max-w-2xl w-full space-y-10">

              {/* Hero */}
              <div className="text-center space-y-4">
                <div
                  className="inline-flex items-center justify-center w-20 h-20 rounded-3xl text-accent mb-1"
                  style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}
                  aria-hidden="true"
                >
                  <ClawLogo className="w-11 h-11" />
                </div>

                <h1 className="text-4xl sm:text-5xl font-display font-bold tracking-tight leading-none">
                  Ready to hunt.
                </h1>

                <p className="text-text-muted leading-relaxed max-w-md mx-auto text-sm sm:text-base">
                  CareerClaw finds best-fit jobs, scores them against your profile,
                  and drafts personalised outreach — all from a single command.
                </p>

                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-2 border border-border text-xs font-mono text-text-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
                  246 tests passing · security-first · no marketplace risk
                </div>
              </div>

              {/* Suggestions */}
              <div className="grid sm:grid-cols-2 gap-2.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      if (!s.pro) {
                        setInput(s.label)
                        textareaRef.current?.focus()
                      }
                    }}
                    className={[
                      'group p-4 rounded-xl text-left transition-all duration-150',
                      'bg-surface border',
                      s.pro
                        ? 'border-border opacity-60 cursor-default'
                        : 'border-border hover:border-accent-border hover:bg-surface-2 cursor-pointer',
                    ].join(' ')}
                    disabled={s.pro}
                    aria-disabled={s.pro}
                  >
                    <div
                      className={[
                        'text-sm font-medium mb-0.5 transition-colors',
                        s.pro
                          ? 'text-text-muted'
                          : 'text-text group-hover:text-accent',
                      ].join(' ')}
                    >
                      {s.label}
                    </div>
                    <div className="text-xs text-text-muted flex items-center gap-1.5">
                      {s.desc}
                      {s.pro && (
                        <span className="px-1.5 py-0.5 rounded-full bg-accent-2-dim text-accent-2 text-[10px] font-semibold">
                          Pro
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Channel status */}
              <div className="flex items-center justify-center gap-6 text-[11px] font-mono text-text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" aria-hidden="true" />
                  Web · active
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
                  Telegram · active
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-border" aria-hidden="true" />
                  WhatsApp · Phase 2
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Input bar ─────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <div
              className="flex items-end gap-2 p-2 rounded-2xl transition-all duration-150"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
              }}
              onFocus={() => {
                const el = document.querySelector<HTMLDivElement>('.input-wrapper')
                if (el) el.style.borderColor = 'var(--accent-border)'
              }}
            >
              {/* Upload resume */}
              <button
                className="p-2 rounded-xl text-text-muted hover:text-text hover:bg-surface transition-all shrink-0 mb-0.5"
                aria-label="Upload resume (PDF)"
                title="Upload resume"
              >
                <Icon.Paperclip />
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask CareerClaw anything…  ↵ send · ⇧↵ newline"
                rows={1}
                className="flex-1 bg-transparent text-sm text-text placeholder:text-text-muted resize-none focus:outline-none py-2 leading-relaxed"
                style={{ minHeight: '36px', maxHeight: '160px' }}
              />

              {/* Send */}
              <button
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="p-2.5 rounded-xl bg-accent text-bg disabled:opacity-25 disabled:cursor-not-allowed hover:brightness-110 active:scale-95 transition-all shrink-0 mb-0.5"
                aria-label="Send message"
              >
                <Icon.Send />
              </button>
            </div>

            <p className="text-center text-[10px] font-mono text-text-muted/40 mt-2 select-none">
              ClawOS MVP scaffold · Chat 1 of 8 · security scanning active
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
