/**
 * index.ts — ClawOS Lightsail Skill Worker entry point
 *
 * Bootstrap only: reads env, warms the embedding model, and starts listening.
 * All HTTP logic lives in app.ts; all skill logic lives in skills/<slug>/.
 */

import { warmEmbeddingProvider } from 'careerclaw-js'
import { app } from './app.js'

const port = Number(process.env.PORT ?? 3002)

// Warm the embedding model before opening the port — the first request must
// never hit a cold-load path. warmEmbeddingProvider() logs and falls back
// gracefully on failure; server starts regardless.
warmEmbeddingProvider()
  .catch(() => {
    // warmEmbeddingProvider already logged the warning; start the server anyway.
  })
  .finally(() => {
    app.listen(port, () => {
      console.log(`[worker] ClawOS skill worker running on http://localhost:${port}`)
    })
  })

export { app }
