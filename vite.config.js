import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react'
          }

          if (
            id.includes('/node_modules/recharts/') ||
            id.includes('/node_modules/d3-')
          ) {
            return 'vendor-charts'
          }

          if (
            id.includes('/node_modules/firebase/') ||
            id.includes('/node_modules/@firebase/')
          ) {
            return 'vendor-firebase'
          }

          return 'vendor'
        },
      },
    },
  },
})
