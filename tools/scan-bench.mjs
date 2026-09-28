#!/usr/bin/env node
// Banc d'essai scan + analyse, dans le processus, avec une vraie base (dist/ requis : npm run build).
// Usage :
//   node tools/scan-bench.mjs gen <bibliothèque> [3131,2724,165]   génère des cbz minuscules valides
//   node tools/scan-bench.mjs run <bibliothèque> <dossier-config>   premier scan + analyse, rescan à vide,
//                                                                   rescan après modification de 10 fichiers
//   Variables : BENCH_DIST (dist/ à charger), BENCH_SCAN_ONLY=1 (tâche ScanLibrary seule), BENCH_REUSE=1 (base
//   existante : seulement les rescans)
// Profil CPU : node --cpu-prof --cpu-prof-dir=build/prof tools/scan-bench.mjs run ...
// Affiche une ligne JSON par phase : durée (s), tâches traitées (par type, durée cumulée), pic de RSS (Mo).
import { mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const [cmd, libraryArg, third] = process.argv.slice(2)
const ROOT = new URL('..', import.meta.url).pathname

// ---------------------------------------------------------------------------
// génération
// ---------------------------------------------------------------------------

function png(r, g, b) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const w = 4
  const h = 6
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const raw = []
  for (let y = 0; y < h; y++) {
    raw.push(0)
    for (let x = 0; x < w; x++) raw.push(r, (g + x * 16) & 255, (b + y * 16) & 255)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** zip « stored » minimal */
function zip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, data] of entries) {
    const n = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0x0800, 6)
    lh.writeUInt16LE(0, 8)
    lh.writeUInt16LE(0, 10)
    lh.writeUInt16LE(0x21, 12)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(data.length, 18)
    lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(n.length, 26)
    lh.writeUInt16LE(0, 28)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(0, 10)
    ch.writeUInt16LE(0, 12)
    ch.writeUInt16LE(0x21, 14)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(data.length, 20)
    ch.writeUInt32LE(data.length, 24)
    ch.writeUInt16LE(n.length, 28)
    ch.writeUInt32LE(offset, 42)
    locals.push(lh, n, data)
    centrals.push(ch, n)
    offset += 30 + n.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

function gen(library, sizes) {
  rmSync(library, { recursive: true, force: true })
  let k = 0
  sizes.forEach((count, s) => {
    const series = `Series ${String.fromCharCode(65 + s)}`
    const dir = join(library, series)
    mkdirSync(dir, { recursive: true })
    for (let i = 1; i <= count; i++) {
      k++
      const num = String(i).padStart(4, '0')
      const comicInfo = `<?xml version="1.0"?>\n<ComicInfo><Series>${series}</Series><Number>${i}</Number><Title>Chapter ${i}</Title></ComicInfo>\n`
      const data = zip([
        ['001.png', png(k & 255, (k >> 8) & 255, 128)],
        ['002.png', png((k * 7) & 255, (k >> 4) & 255, 64)],
        ['ComicInfo.xml', Buffer.from(comicInfo)],
      ])
      writeFileSync(join(dir, `${series} ${num}.cbz`), data)
    }
  })
  console.log(`${k} fichiers dans ${library}`)
}

// ---------------------------------------------------------------------------
// exécution
// ---------------------------------------------------------------------------

const rssMb = () => Math.round(Number(/VmRSS:\s+(\d+)/.exec(readFileSync('/proc/self/status', 'utf8'))[1]) / 1024)
const hwmMb = () => Math.round(Number(/VmHWM:\s+(\d+)/.exec(readFileSync('/proc/self/status', 'utf8'))[1]) / 1024)
const resetHwm = () => {
  try {
    writeFileSync('/proc/self/clear_refs', '5')
  } catch {
    // noyau sans clear_refs : pic global
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run(library, configDir) {
  // BENCH_REUSE=1 : base existante (bibliothèque déjà scannée et analysée), seulement les rescans
  const reuse = process.env.BENCH_REUSE === '1'
  if (!reuse) rmSync(configDir, { recursive: true, force: true })
  mkdirSync(configDir, { recursive: true })
  const dist = resolve(process.env.BENCH_DIST ?? join(ROOT, 'dist'), 'src')
  // BENCH_SCAN_ONLY=1 : tâches non traitées, seule la tâche ScanLibrary est exécutée (directement) à chaque phase
  const scanOnly = process.env.BENCH_SCAN_ONLY === '1'
  const imp = (p) => import(pathToFileURL(join(dist, p)).href)
  const { runApplication } = await imp('port/spring-boot-application.js')
  const ctx = await runApplication([`--server.port=0`, `--komga.config-dir=${configDir}`, '--logging.level.org.gotson.komga=WARN'])
  const { LibraryLifecycle } = await imp('domain/service/LibraryLifecycle.js')
  const { Library } = await imp('domain/model/Library.js')
  const { pathToUrl } = await imp('port/java-net.js')
  const { TaskEmitter } = await imp('application/tasks/TaskEmitter.js')
  const { TaskHandler } = await imp('application/tasks/TaskHandler.js')
  const { TasksRepository } = await imp('application/tasks/TasksRepository.js')
  const { BookRepository } = await imp('domain/persistence/BookRepository.js')
  const { TaskProcessor } = await imp('application/tasks/TaskProcessor.js')
  const { Task } = await imp('application/tasks/Task.js')
  if (scanOnly) ctx.getBean(TaskProcessor).processTasks = false

  // durée cumulée par type de tâche
  const handler = ctx.getBean(TaskHandler)
  let stats = new Map()
  const orig = handler.handleTask.bind(handler)
  handler.handleTask = async (task) => {
    const t = performance.now()
    try {
      return await orig(task)
    } finally {
      const name = task.constructor.name
      const s = stats.get(name) ?? { n: 0, s: 0 }
      s.n++
      s.s += (performance.now() - t) / 1000
      stats.set(name, s)
    }
  }
  const tasks = ctx.getBean(TasksRepository)
  const drained = async () => {
    let stable = 0
    while (stable < 3) {
      await sleep(100)
      stable = tasks.count() === 0 ? stable + 1 : 0
    }
  }
  const phase = async (name, start) => {
    stats = new Map()
    resetHwm()
    const t = performance.now()
    let peak = rssMb()
    const timer = setInterval(() => (peak = Math.max(peak, rssMb())), 200)
    await start()
    if (scanOnly) {
      const scan = tasks.findAll().find((it) => it instanceof Task.ScanLibrary)
      tasks.deleteAll()
      if (scan) await handler.handleTask(scan)
      tasks.deleteAll()
    } else await drained()
    clearInterval(timer)
    const s = ((performance.now() - t) / 1000 - (scanOnly ? 0 : 0.3)).toFixed(2)
    const byTask = Object.fromEntries([...stats].sort((a, b) => b[1].s - a[1].s).map(([k, v]) => [k, `${v.n} / ${v.s.toFixed(2)}s`]))
    console.log(JSON.stringify({ phase: name, s: Number(s), rssPeakMb: Math.max(peak, hwmMb()), tasks: byTask }))
  }

  const { LibraryRepository } = await imp('domain/persistence/LibraryRepository.js')
  let library0 = reuse ? ctx.getBean(LibraryRepository).findAll()[0] : undefined
  if (!reuse)
    await phase('first scan + analysis', async () => {
      library0 = ctx.getBean(LibraryLifecycle).addLibrary(new Library({ name: 'Bench', root: pathToUrl(resolve(library)) }))
    })
  const books = ctx.getBean(BookRepository).findAll()
  console.log(JSON.stringify({ books: books.length }))
  await phase('rescan, nothing changed', async () => ctx.getBean(TaskEmitter).scanLibrary(library0.id))
  const now = new Date()
  const sorted = books.map((b) => b.path).sort()
  // fichiers modifiés et leur dossier (comme un remplacement de fichier) : Komga ne relit une série que si la date
  // de modification de son dossier change
  for (let i = 0; i < 10; i++) {
    const f = sorted[Math.floor((i * sorted.length) / 10)]
    utimesSync(f, now, now)
    utimesSync(dirname(f), now, now)
  }
  await phase('rescan, 10 files touched', async () => ctx.getBean(TaskEmitter).scanLibrary(library0.id))
  await ctx.closeAndAwaitTermination?.()
  process.exit(0)
}

if (cmd === 'gen') gen(libraryArg, (third ?? '3131,2724,165').split(',').map(Number))
else if (cmd === 'run') await run(libraryArg, third)
else {
  console.error('usage: scan-bench.mjs gen <bibliothèque> [tailles] | run <bibliothèque> <dossier-config>')
  process.exit(2)
}
