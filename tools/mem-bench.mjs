#!/usr/bin/env node
// Banc d'essai mémoire : même scénario sur Komga (JVM) et KomgaJS, chacun avec une configuration vierge.
// Usage : node tools/mem-bench.mjs <java|js> <port> <dossier-config> <bibliothèque> [-- options de lancement]
// BENCH_ISBN=false : bibliothèque sans lecture des codes-barres ISBN (défaut de l'interface web) ; sinon activée (défaut de l'API)
// Serveur distant (conteneur sur une autre machine) : <java|js> devient `remote`, le port et le dossier de config sont
// ignorés, <bibliothèque> est le chemin vu par le serveur, et BENCH_URL (adresse du serveur), BENCH_START (commande
// qui lance le serveur au premier plan et affiche son journal), BENCH_RSS (affiche sa mémoire résidente en Mo),
// BENCH_STOP (l'arrête) remplacent le lancement local. BENCH_LABEL nomme la ligne de résultat.
// Bibliothèque existante (BENCH_EXISTING=1) : la base est déjà remplie, rien n'est créé. BENCH_USER / BENCH_PASS ouvrent
// la session ; « scan » devient le temps jusqu'à ce que la file des tâches soit vide (BENCH_PENDING affiche le nombre
// de tâches en attente) ; lecture et API portent sur BENCH_SAMPLE livres (défaut 200) pris à intervalles réguliers.
// BENCH_PEAK affiche le pic de mémoire résidente (Mo).
// BENCH_JAR : jar de Komga à lancer (jar extrait par `java -Djarmode=tools -jar komga.jar extract`, pour le cache AOT)
// BENCH_EXIT_WAIT_S : attente après SIGTERM avant SIGKILL (défaut 3 ; l'écriture d'un cache AOT à l'arrêt est plus longue)
// Mesure le RSS du processus (Mo) : au repos, après scan + analyse, après lecture (miniatures + pages), après la
// charge API ; la durée du scan + analyse (relevé toutes les 250 ms) ; la latence (ms : médiane, 99e centile, max) des
// miniatures, des pages et de l'API JSON (BENCH_API_N requêtes à la suite, défaut 2000) ; le débit de l'API avec
// 16 requêtes simultanées.
import { execSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const [kind, port, configDir, library, ...rest] = process.argv.slice(2)
const ROOT = new URL('..', import.meta.url).pathname
const extra = rest[0] === '--' ? rest.slice(1) : rest
const remote = kind === 'remote'
if (!remote) {
  rmSync(configDir, { recursive: true, force: true })
  mkdirSync(configDir, { recursive: true })
}

const args = [`--server.port=${port}`, `--komga.config-dir=${configDir}`]
const child = remote
  ? spawn('sh', ['-c', process.env.BENCH_START], { stdio: ['ignore', 'pipe', 'pipe'] })
  : kind === 'java'
    ? spawn('java', [...extra, '-jar', process.env.BENCH_JAR ?? join(ROOT, '../komga-src/komga/build/libs/komga-1.28.1.jar'), ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(join(ROOT, 'bin/komgajs'), args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...Object.fromEntries(extra.map((e) => e.split('='))) } })
let log = ''
child.stdout.on('data', (d) => (log += d))
child.stderr.on('data', (d) => (log += d))

const rssMb = () => {
  if (remote) return Math.round(Number(execSync(process.env.BENCH_RSS, { encoding: 'utf8' }).trim()))
  // le processus java/node est l'enfant direct (bin/komgajs fait exec)
  const status = readFileSync(`/proc/${child.pid}/status`, 'utf8')
  return Math.round(Number(/VmRSS:\s+(\d+)/.exec(status)[1]) / 1024)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const base = process.env.BENCH_URL ?? `http://localhost:${port}`
// Authentification basique à la première requête, puis cookie de session comme l'interface web (sinon chaque
// requête paie une vérification bcrypt, ~90 ms, qui masque tout le reste).
const existing = process.env.BENCH_EXISTING === '1'
let auth = { Authorization: `Basic ${Buffer.from(`${process.env.BENCH_USER ?? 'bench@example.org'}:${process.env.BENCH_PASS ?? 'bench'}`).toString('base64')}` }
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

if (!existing) await fetch(`${base}/api/v1/claim`, { method: 'POST', headers: { 'X-Komga-Email': 'bench@example.org', 'X-Komga-Password': 'bench' } })
{
  const r = await api('/api/v2/users/me')
  await r.arrayBuffer()
  const cookies = r.headers.getSetCookie().map((c) => c.split(';')[0])
  if (!r.ok || cookies.length === 0) throw new Error(`pas de session : ${r.status}`)
  auth = { Cookie: cookies.join('; ') }
}
if (!existing) await api('/api/v1/libraries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Bench', root: library, importBarcodeIsbn: process.env.BENCH_ISBN !== 'false' }) })
// fin du scan et de l'analyse : plus de livre au statut UNKNOWN pendant 3 relevés consécutifs
const tScan = Date.now()
let stable = 0
let books = 0
let tDone = 0
while (!existing && stable < 3 && Date.now() - tScan < 15 * 60_000) {
  await sleep(stable > 0 ? 2000 : 250)
  const all = await (await api('/api/v1/books?unpaged=true')).json()
  const unknown = all.content.filter((b) => b.media.status === 'UNKNOWN').length
  books = all.totalElements
  if (books > 0 && unknown === 0) {
    if (stable === 0) tDone = Date.now()
    stable++
  } else stable = 0
}
// bibliothèque existante : tâches de démarrage (scan des bibliothèques, index de recherche) terminées
while (existing && stable < 3 && Date.now() - tScan < 60 * 60_000) {
  await sleep(5000)
  const pending = Number(execSync(process.env.BENCH_PENDING, { encoding: 'utf8' }).trim())
  if (pending === 0) {
    if (stable === 0) tDone = Date.now()
    stable++
  } else stable = 0
}
const scanS = (tDone - tScan) / 1000
await sleep(5000)
const afterScan = rssMb()

// lecture : miniature de chaque livre et de chaque série, première page de chaque livre
const timed = async (times, path, init) => {
  const t = performance.now()
  const r = await api(path, init)
  await r.arrayBuffer()
  if (!r.ok) throw new Error(`${r.status} ${path}`)
  times.push(performance.now() - t)
}
const stats = (times) => {
  const s = [...times].sort((a, b) => a - b)
  const at = (q) => Math.round(s[Math.min(s.length - 1, Math.floor(s.length * q))] * 10) / 10
  return { n: s.length, p50: at(0.5), p99: at(0.99), max: at(1) }
}
let all
if (existing) {
  // échantillon réparti sur toute la bibliothèque, par pages de 50
  const first = await (await api('/api/v1/books?size=50&page=0')).json()
  books = first.totalElements
  const n = Math.ceil(Number(process.env.BENCH_SAMPLE ?? 200) / 50)
  all = { content: [...first.content] }
  for (let i = 1; i < n; i++) all.content.push(...(await (await api(`/api/v1/books?size=50&page=${Math.floor((i * first.totalPages) / n)}`)).json()).content)
} else all = await (await api('/api/v1/books?unpaged=true')).json()
const deep = existing ? Math.min(100, Math.ceil(books / 20)) : 3
const tRead = Date.now()
const thumbMs = []
const pageMs = []
const series = await (await api('/api/v1/series?unpaged=true')).json()
// BENCH_READ_ROUNDS tours de lecture (défaut 3) : la latence porte sur tous, readS sur le premier
let readS = 0
for (let round = 0; round < Number(process.env.BENCH_READ_ROUNDS ?? 3); round++) {
  for (const b of all.content) {
    await timed(thumbMs, `/api/v1/books/${b.id}/thumbnail`)
    if (b.media.pagesCount > 0) await timed(pageMs, `/api/v1/books/${b.id}/pages/${1 + (round % b.media.pagesCount)}`)
  }
  for (const s of series.content) await timed(thumbMs, `/api/v1/series/${s.id}/thumbnail`)
  if (round === 0) readS = (Date.now() - tRead) / 1000
}
await sleep(5000)
const afterRead = rssMb()

// API JSON : les requêtes d'une interface (listes paginées, détail, recherche), à la suite puis 16 à la fois
const json = { method: 'POST', headers: { 'Content-Type': 'application/json' } }
const calls = (i) => {
  const b = all.content[i % all.content.length]
  const s = series.content[i % series.content.length]
  return [
    ['/api/v1/libraries'],
    [`/api/v1/series?page=${existing ? 0 : i % 3}&size=20`],
    [`/api/v1/books?page=${i % deep}&size=20&sort=metadata.numberSort,asc`],
    [`/api/v1/series/${s.id}`],
    [`/api/v1/books/${b.id}`],
    [`/api/v1/series/${s.id}/books?size=20`],
    ['/api/v1/books/list?size=20', { ...json, body: JSON.stringify({ condition: { seriesId: { operator: 'is', value: s.id } } }) }],
    ['/api/v1/series/list?size=20', { ...json, body: JSON.stringify({ condition: { title: { operator: 'contains', value: 'r' } }, fullTextSearch: existing ? 'the' : 'serie' }) }],
    ['/api/v1/books/ondeck?size=20'],
    ['/api/v2/users/me'],
  ][i % 10]
}
const apiN = Number(process.env.BENCH_API_N ?? 2000)
const apiMs = []
for (let i = 0; i < apiN; i++) await timed(apiMs, ...calls(i))
const tPar = Date.now()
let next = 0
await Promise.all(
  Array.from({ length: 16 }, async () => {
    const sink = []
    while (next < apiN) await timed(sink, ...calls(next++))
  }),
)
const apiRps = Math.round(apiN / ((Date.now() - tPar) / 1000))
await sleep(5000)
const afterApi = rssMb()

console.log(
  JSON.stringify({
    kind: process.env.BENCH_LABEL ?? kind,
    extra,
    startupS,
    books,
    scanS,
    readS,
    rssMb: { idle, afterScan, afterRead, afterApi },
    ms: { thumbnail: stats(thumbMs), page: stats(pageMs), api: stats(apiMs), apiFirst100: stats(apiMs.slice(0, 100)) },
    apiRps,
    ...(process.env.BENCH_PEAK ? { peakMb: Math.round(Number(execSync(process.env.BENCH_PEAK, { encoding: 'utf8' }).trim())) } : {}),
  }),
)
if (remote) execSync(process.env.BENCH_STOP, { stdio: 'ignore' })
else child.kill('SIGTERM')
for (let i = 0; i < Number(process.env.BENCH_EXIT_WAIT_S ?? 3) * 10 && child.exitCode === null; i++) await sleep(100)
if (child.exitCode === null) child.kill('SIGKILL')
process.exit(0)
