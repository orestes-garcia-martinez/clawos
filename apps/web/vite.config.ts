import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Read the root monorepo package.json at config-load time
const rootPkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')) as {
  version: string
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env['VITE_API_URL'] ?? 'http://localhost:3001'

  return {
    plugins: [tailwindcss(), react()],

    // Inject the version as a global constant replaced at build time
    define: {
      __APP_VERSION__: JSON.stringify(rootPkg.version),
    },

    server: {
      port: 5173,
      strictPort: true,
      // In dev, proxy /api/* → API URL so the browser never makes a
      // cross-origin or mixed-content request directly to the Lightsail IP.
      proxy: {
        '/api': {
          target: apiTarget,
          rewrite: (path: string) => path.replace(/^\/api/, ''),
          changeOrigin: true,
        },
      },
    },

    preview: {
      port: 4173,
    },
  }
})
