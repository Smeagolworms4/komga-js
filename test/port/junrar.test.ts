// Tests du support de portage port/junrar.ts (sans jumeau Kotlin) : chargement de node-unrar-js sans effet global.
import { describe, expect, it } from 'vitest'

describe('junrar', () => {
  it('loading unrar does not install global process error handlers', async () => {
    const before = {
      uncaughtException: process.listeners('uncaughtException').length,
      unhandledRejection: process.listeners('unhandledRejection').length,
    }
    const junrar = await import('../../src/port/junrar.js')
    expect(junrar.Archive).toBeDefined()
    expect(process.listeners('uncaughtException')).toHaveLength(before.uncaughtException)
    expect(process.listeners('unhandledRejection')).toHaveLength(before.unhandledRejection)
    // aucun gestionnaire Emscripten (`throw ex` / `throw reason`) ne reste en place
    for (const l of [...process.listeners('uncaughtException'), ...process.listeners('unhandledRejection')]) expect(String(l)).not.toMatch(/ExitStatus|throw reason/)
  })
})
