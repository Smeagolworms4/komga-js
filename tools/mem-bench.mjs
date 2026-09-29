#!/usr/bin/env node
// Banc d'essai mémoire : même scénario sur Komga (JVM) et KomgaJS, chacun avec une configuration vierge.
// Usage : node tools/mem-bench.mjs <java|js> <port> <dossier-config> <bibliothèque> [-- options de lancement]
// BENCH_ISBN=false : bibliothèque sans lecture des codes-barres ISBN (défaut de l'interface web) ; sinon activée (défaut de l'API)
// Mesure le RSS du processus (Mo) : au repos, après scan + analyse, après lecture (miniatures + pages).
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const [kind, port, configDir, library, ...rest] = process.argv.slice(2)
const ROOT = new URL('..', import.meta.url).pathname
const extra = rest[0] === '--' ? rest.slice(1) : rest
rmSync(configDir, { recursive: true, force: true })
mkdirSync(configDir, { recursive: true })

const args = [`--server.port=${port}`, `--komga.config-dir=${configDir}`]
const child =
  kind === 'java'
    ? spawn('java', [...extra, '-jar', join(ROOT, '../komga-src/komga/build/libs/komga-1.27.1.jar'), ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(join(ROOT, 'bin/komgajs'), args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...Object.fromEntries(extra.map((e) => e.split('='))) } })
let log = ''
child.stdout.on('data', (d) => (log += d))
child.stderr.on('data', (d) => (log += d))

const rssMb = () => {
  // le processus java/node est l'enfant direct (bin/komgajs fait exec)
  const status = readFileSync(`/proc/${child.pid}/status`, 'utf8')
  return Math.round(Number(/VmRSS:\s+(\d+)/.exec(status)[1]) / 1024)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const base = `http://localhost:${port}`
const auth = { Authorization: `Basic ${Buffer.from('bench@example.org:bench').toString('base64')}` }
const api = async (path, init = {}) => {
  const r = await fetch(base + path, { ...init, headers: { ...auth, ...(init.headers ?? {}) } })
  return r
}

const t0 = Date.now()
while (!/Started Application/.test(log)) {
  if (child.exitCode !== null) throw new Error(`arrêt prématuré :\n${log.slice(-2000)}`)
  await sleep(200)
}
const startupS = (Date.now() - t0) / 1000
await sleep(5000)
const idle = rssMb()

await fetch(`${base}/api/v1/claim`, { method: 'POST', headers: { 'X-Komga-Email': 'bench@example.org', 'X-Komga-Password': 'bench' } })
await api('/api/v1/libraries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Bench', root: library, importBarcodeIsbn: process.env.BENCH_ISBN !== 'false' }) })
// fin du scan et de l'analyse : plus de livre au statut UNKNOWN pendant 3 relevés consécutifs
const tScan = Date.now()
let stable = 0
let books = 0
while (stable < 3 && Date.now() - tScan < 15 * 60_000) {
  await sleep(2000)
  const all = await (await api('/api/v1/books?unpaged=true')).json()
  const unknown = all.content.filter((b) => b.media.status === 'UNKNOWN').length
  books = all.totalElements
  stable = books > 0 && unknown === 0 ? stable + 1 : 0
}
const scanS = (Date.now() - tScan) / 1000
await sleep(5000)
const afterScan = rssMb()

// lecture : miniature de chaque livre et de chaque série, première page de chaque livre
const all = await (await api('/api/v1/books?unpaged=true')).json()
for (const b of all.content) {
  await (await api(`/api/v1/books/${b.id}/thumbnail`)).arrayBuffer()
  if (b.media.pagesCount > 0) await (await api(`/api/v1/books/${b.id}/pages/1`)).arrayBuffer()
}
const series = await (await api('/api/v1/series?unpaged=true')).json()
for (const s of series.content) await (await api(`/api/v1/series/${s.id}/thumbnail`)).arrayBuffer()
await sleep(5000)
const afterRead = rssMb()

console.log(JSON.stringify({ kind, extra, startupS, books, scanS, rssMb: { idle, afterScan, afterRead } }))
child.kill('SIGTERM')
await sleep(3000)
if (child.exitCode === null) child.kill('SIGKILL')
process.exit(0)
