import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env['VITE_API_URL'] ?? 'http://localhost:3001'

  return {
    plugins: [tailwindcss(), react()],

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
