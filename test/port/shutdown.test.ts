// Test du support de portage port/spring-boot-application.ts (shutdown hook) et port/spring-boot-web.ts (arrêt
// gracieux), sans jumeau Kotlin : le serveur complet, lancé dans un processus enfant, s'arrête sur SIGTERM en quelques
// secondes même avec l'interface web ouverte (flux SSE et connexion keep-alive) et après l'expiration du pool de tâches.
// Régression : l'arrêt gracieux attendait la fin du flux SSE (30 s, spring.lifecycle.timeout-per-shutdown-phase) car
// SseController n'était arrêté qu'après lui ; `docker stop` tuait le processus au bout de 10 s (code 137).
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { Agent, type IncomingMessage, get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const configDir = mkdtempSync(join(tmpdir(), 'shutdown-'))
let child: ChildProcess | null = null
afterAll(() => {
  child?.kill('SIGKILL')
  rmSync(configDir, { recursive: true, force: true })
})

function httpGet(url: string, headers: Record<string, string>, agent?: Agent): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => get(url, { headers, agent }, resolve).on('error', reject))
}

describe('shutdown on SIGTERM', () => {
  it('exits within a few seconds with an open SSE stream and an idle keep-alive connection, after the task pool expired', async () => {
    const proc = spawn(
      process.execPath,
      [
        '--experimental-transform-types',
        '--no-warnings',
        '--expose-gc',
        '--import',
        './test/support/ts-source-loader.mjs',
        'src/main.ts',
        '--server.port=0',
        `--komga.config-dir=${configDir}`,
        // expiration du pool de tâches (60 s par défaut) après les tâches du démarrage : caches vidés, gc, malloc_trim
        '--spring.task.execution.pool.keep-alive=1s',
      ],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    child = proc
    let log = ''
    proc.stdout?.on('data', (d: Buffer) => (log += d.toString()))
    proc.stderr?.on('data', (d: Buffer) => (log += d.toString()))
    const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
      proc.once('exit', (code, signal) => resolve({ code, signal })),
    )

    for (let i = 0; !log.includes('Started Application'); i++) {
      if (proc.exitCode !== null || i > 600) throw new Error(`server did not start:\n${log.slice(-3000)}`)
      await delay(100)
    }
    const port = Number(/Tomcat started on port (\d+)/.exec(log)?.[1])
    const base = `http://localhost:${port}`

    const claim = await fetch(`${base}/api/v1/claim`, {
      method: 'POST',
      headers: { 'X-Komga-Email': 'admin@example.org', 'X-Komga-Password': 'secret' },
    })
    expect(claim.status).toBe(200)
    const auth = { Authorization: `Basic ${Buffer.from('admin@example.org:secret').toString('base64')}` }

    // interface web ouverte : flux SSE…
    const sse = await httpGet(`${base}/sse/v1/events`, { ...auth, Accept: 'text/event-stream' })
    expect(sse.statusCode).toBe(200)
    const sseEnded = new Promise<void>((resolve) => {
      sse.on('end', resolve).on('close', resolve).on('error', () => resolve())
      sse.resume()
    })
    // … et une connexion keep-alive restée ouverte après une requête
    const agent = new Agent({ keepAlive: true })
    const me = await httpGet(`${base}/api/v2/users/me`, auth, agent)
    expect(me.statusCode).toBe(200)
    me.resume()
    await new Promise((resolve) => me.on('end', resolve))

    // inactif au-delà du keep-alive du pool de tâches (1 s) et du délai de libération de la mémoire (1 s)
    await delay(3_500)

    const t0 = Date.now()
    proc.kill('SIGTERM')
    const exit = await Promise.race([exited, delay(10_000).then(() => null)])
    const elapsed = Date.now() - t0
    agent.destroy()

    expect(exit, `no exit 10 s after SIGTERM:\n${log.slice(-3000)}`).not.toBeNull()
    expect(elapsed).toBeLessThan(5_000)
    // comme la JVM terminée par SIGTERM : 128 + 15
    expect(exit).toEqual({ code: 143, signal: null })
    await sseEnded
    expect(log).toContain('Received SIGTERM, shutting down')
    expect(log).toContain('Commencing graceful shutdown. Waiting for active requests to complete')
    expect(log).toContain('Graceful shutdown complete')
  }, 90_000)
})
