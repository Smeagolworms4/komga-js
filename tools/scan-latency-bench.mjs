#!/usr/bin/env node
// Réactivité du serveur pendant les tâches, sur une configuration vierge :
//  1. ajout d'une bibliothèque (scan, analyse, miniatures, empreintes des fichiers et des pages) ;
//  2. fichiers modifiés sur le disque (date seulement) puis nouveau scan : la tâche ScanLibrary recalcule l'empreinte
//     de chaque livre (cas relevé sur Raspberry Pi : ScanLibrary de 305 s, serveur muet pendant ce temps).
// Pendant chaque phase, et jusqu'à ce que la file des tâches soit vide, /actuator/health et une liste de l'API sont
// sondés en continu. Mesure la latence (p50, p99, max), le pic de RSS (VmHWM) et la durée des traitements.
// Usage : node tools/scan-latency-bench.mjs <port> <dossier-config> <bibliothèque> [-- VAR=valeur ...]
// BENCH_MAX_S : durée maximale de mesure par phase (s) ; BENCH_PHASES=1 : première phase seulement.
import Database from 'better-sqlite3'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync } from 'node:fs'
import { setPriority } from 'node:os'
import { join } from 'node:path'

const [port, configDir, library, ...rest] = process.argv.slice(2)
// BENCH_NICE : priorité du banc et du serveur (machine partagée)
if (process.env.BENCH_NICE) setPriority(Number(process.env.BENCH_NICE))
const ROOT = new URL('..', import.meta.url).pathname
const extra = rest[0] === '--' ? rest.slice(1) : rest
rmSync(configDir, { recursive: true, force: true })
mkdirSync(configDir, { recursive: true })

const child = spawn(join(ROOT, 'bin/komgajs'), [`--server.port=${port}`, `--komga.config-dir=${configDir}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ...Object.fromEntries(extra.map((e) => e.split('='))) },
})
let log = ''
child.stdout.on('data', (d) => (log += d))
child.stderr.on('data', (d) => (log += d))

const status = () => readFileSync(`/proc/${child.pid}/status`, 'utf8')
const mb = (key) => Math.round(Number(new RegExp(`${key}:\\s+(\\d+)`).exec(status())[1]) / 1024)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const base = `http://localhost:${port}`
let auth = { Authorization: `Basic ${Buffer.from('bench@example.org:bench').toString('base64')}` }
const api = (path, init = {}) => fetch(base + path, { ...init, headers: { ...auth, ...(init.headers ?? {}) } })

while (!/Started Application/.test(log)) {
  if (child.exitCode !== null) throw new Error(`arrêt prématuré :\n${log.slice(-2000)}`)
  await sleep(200)
}
await sleep(3000)
const idle = mb('VmRSS')

await fetch(`${base}/api/v1/claim`, { method: 'POST', headers: { 'X-Komga-Email': 'bench@example.org', 'X-Komga-Password': 'bench' } })
// session (cookie SESSION) : l'authentification Basic vérifie le mot de passe (bcrypt, ~70 ms) à chaque requête
const me = await api('/api/v1/users/me')
auth = { Cookie: me.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') }

let peakRss = 0
const rssSampler = setInterval(() => {
  try {
    peakRss = Math.max(peakRss, mb('VmRSS'))
  } catch {
    // processus terminé
  }
}, 200)
const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y)
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? NaN)
}
const summary = (a) => ({ n: a.length, p50: pct(a, 50), p99: pct(a, 99), max: Math.round(Math.max(...a)) })

// mesure pendant le traitement déclenché par `trigger`, jusqu'à ce que la file des tâches soit vide
const measure = async (trigger) => {
  const latencies = { health: [], list: [] }
  let probing = true
  // une requête à la fois par point d'accès, toutes les 100 ms
  const probe = async (name, path) => {
    while (probing) {
      const t = performance.now()
      try {
        const r = await api(path, { signal: AbortSignal.timeout(60_000) })
        await r.arrayBuffer()
        latencies[name].push(performance.now() - t)
      } catch {
        latencies[name].push(60_000)
      }
      await sleep(100)
    }
  }
  const logStart = log.length
  const t0 = Date.now()
  const probes = [probe('health', '/actuator/health'), probe('list', '/api/v1/series?page=0&size=20')]
  await trigger()
  // fin : file des tâches vide pendant 3 relevés consécutifs (lecture directe de tasks.sqlite)
  const tasksDb = join(configDir, 'tasks.sqlite')
  let empty = 0
  let seen = false
  const maxMs = Number(process.env.BENCH_MAX_S ?? 3600) * 1000
  while (empty < 3 && Date.now() - t0 < maxMs) {
    await sleep(1000)
    if (!existsSync(tasksDb)) continue
    let count = 1
    try {
      const db = new Database(tasksDb, { readonly: true, fileMustExist: true })
      count = db.prepare('select count(*) as c from TASK').get().c
      db.close()
    } catch {
      // base verrouillée : nouvel essai
    }
    if (count > 0 || /Task ScanLibrary\(.*\) executed in/.test(log.slice(logStart))) seen = true
    empty = seen && count === 0 ? empty + 1 : 0
  }
  const tasksS = empty >= 3 ? (Date.now() - t0) / 1000 - 3 : `>${Math.round((Date.now() - t0) / 1000)} (interrompu)`
  probing = false
  await Promise.all(probes)
  const scanMs = /Task ScanLibrary\(.*\) executed in ([\d.]+)ms/.exec(log.slice(logStart))?.[1]
  return {
    scanLibraryS: scanMs ? Number(scanMs) / 1000 : null,
    allTasksS: tasksS,
    latencyMs: { health: summary(latencies.health), list: summary(latencies.list) },
  }
}

// 1. nouvelle bibliothèque
const first = await measure(() =>
  api('/api/v1/libraries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Bench', root: library }) }),
)
const books = (await (await api('/api/v1/books?unpaged=true')).json()).totalElements
const libraryId = (await (await api('/api/v1/libraries')).json())[0].id

// 2. fichiers modifiés sur le disque (date seulement), puis scan
let rescan = null
if (process.env.BENCH_PHASES !== '1') {
  const touched = new Date()
  for (const s of readdirSync(library)) {
    for (const b of readdirSync(join(library, s))) utimesSync(join(library, s, b), touched, touched)
    utimesSync(join(library, s), touched, touched)
  }
  rescan = await measure(() => api(`/api/v1/libraries/${libraryId}/scan`, { method: 'POST' }))
}
clearInterval(rssSampler)
const hwm = mb('VmHWM')
const afterRss = mb('VmRSS')
// BENCH_IDLE_WAIT_S : RSS après une période d'inactivité (arrêt du worker des tâches inactif, ou des threads du pool
// de tâches) ; relevé toutes les 5 s (idleMin : le plus bas)
let idleAfter = null
let idleMin = null
if (process.env.BENCH_IDLE_WAIT_S) {
  const end = Date.now() + Number(process.env.BENCH_IDLE_WAIT_S) * 1000
  while (Date.now() < end) {
    await sleep(Math.min(5000, end - Date.now()))
    idleAfter = mb('VmRSS')
    idleMin = Math.min(idleMin ?? idleAfter, idleAfter)
  }
}

console.log(JSON.stringify({ books, rssMb: { idle, peak: Math.max(peakRss, hwm), after: afterRss, idleAfter, idleMin }, newLibrary: first, rescanModified: rescan }))
if (process.env.BENCH_LOG) console.log(log)
child.kill('SIGTERM')
await sleep(3000)
if (child.exitCode === null) child.kill('SIGKILL')
process.exit(0)
