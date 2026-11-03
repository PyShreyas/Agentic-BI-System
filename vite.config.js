import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Let Rollup determine dependency chunk boundaries automatically.
// The previous manual vendor split separated Recharts and its D3 dependencies
// into independently initialized chunks. In the deployed app this produced
// a temporal-dead-zone error ("Cannot access 'Ph' before initialization")
// before React could mount. Keeping the dependency graph intact avoids that
// unsafe cross-chunk initialization order.
export default defineConfig({
  plugins: [react()],
})
