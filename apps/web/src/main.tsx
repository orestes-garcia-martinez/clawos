import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Restore persisted theme before first paint to avoid flash
try {
  const stored = localStorage.getItem('clawos-theme')
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.dataset['theme'] = stored
  }
} catch {
  /* storage unavailable — dark theme default applied via CSS */
}

async function bootstrap(): Promise<void> {
  // Start MSW mock service worker when running in mock mode.
  // This intercepts fetch() calls to /api/* and returns fake SSE / JSON responses.
  if (import.meta.env['VITE_MOCK'] === 'true') {
    const { worker } = await import('./mocks/browser.ts')
    await worker.start({ onUnhandledRequest: 'bypass' })
    console.info('[ClawOS] Mock mode enabled — no real API/Supabase calls')
  }

  const root = document.getElementById('root')
  if (!root) throw new Error('Root element #root not found')

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
