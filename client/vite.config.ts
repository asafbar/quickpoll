import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const target = process.env.QUICKPOLL_API_PROXY_TARGET || 'http://localhost:3001'
const proxy = { '/api': target, '/socket.io': { target, ws: true } }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
})
