import { mkdirSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// Bases SQLite temporaires des tests (java.io.tmpdir = os.tmpdir()) dans le projet, pas sur le disque système
const tmp = new URL('./build/tmp', import.meta.url).pathname
mkdirSync(tmp, { recursive: true })
process.env.TMPDIR = tmp

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'json', 'html'],
    },
  },
})
