import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

// Bases SQLite temporaires des tests (java.io.tmpdir = os.tmpdir()) dans le projet, pas sur le disque système
const tmp = new URL('./build/tmp', import.meta.url).pathname
mkdirSync(tmp, { recursive: true })
process.env.TMPDIR = tmp
// nettoyage des restes de plus de 30 min (bases de test, caches ssr de Vitest)
for (const f of readdirSync(tmp)) {
  try {
    const p = join(tmp, f)
    if (Date.now() - statSync(p).mtimeMs > 30 * 60_000) rmSync(p, { recursive: true, force: true })
  } catch {
    // fichier en cours d'utilisation ou déjà supprimé
  }
}

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // tests unitaires à oracle : npm run test:unit (vitest.unit.config.ts, fuseau fixé)
    exclude: ['test/unit/**', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'json', 'html'],
    },
  },
})
