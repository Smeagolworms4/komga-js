import { mkdirSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// Tests unitaires à oracle (test/unit/, voir PORTING.md) : pas de contexte Spring, pas de setup global.
// Même fuseau et même locale que les oracles Kotlin (komga/build.gradle.kts, propriété oracleOut).
const tmp = new URL('./build/tmp', import.meta.url).pathname
mkdirSync(tmp, { recursive: true })
process.env.TMPDIR = tmp
process.env.TZ = 'Europe/Paris'

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    env: { TZ: 'Europe/Paris', LANG: 'en_US.UTF-8', TMPDIR: tmp },
  },
})
