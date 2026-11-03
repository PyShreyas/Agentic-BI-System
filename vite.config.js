import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Let Rollup determine dependency chunk boundaries automatically.
// The previous manual vendor split separated Recharts and its D3 dependencies
// into independently initialized chunks, causing a temporal-dead-zone error
// before React mounted. Avoid unsafe cross-chunk initialization ordering.
export default defineConfig({
  plugins: [react()],
})
