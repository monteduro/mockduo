import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowedHosts = ['duosimulator-ms.stemonte.io']

const shotProxy = {
  '/shot': {
    target: 'http://127.0.0.1:8787',
    changeOrigin: true,
  },
  '/api': {
    target: 'http://127.0.0.1:8787',
    changeOrigin: true,
  },
  '/health': {
    target: 'http://127.0.0.1:8787',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts,
    proxy: shotProxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    allowedHosts,
    proxy: shotProxy,
  },
})
