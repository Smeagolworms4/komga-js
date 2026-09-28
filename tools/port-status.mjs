#!/usr/bin/env node
// Vérifie que chaque fichier Kotlin de Komga a son jumeau TypeScript, qu'il est
// porté depuis la révision upstream courante, et que chaque test Kotlin existe
// côté Vitest avec le même nom.
//
// Convention (portage à plat) :
//   komga/src/main/kotlin/org/gotson/komga/<p>/X.kt  -> src/<p>/X.ts
//   komga/src/flyway/kotlin/<p>/X.kt                 -> src/flyway/<p>/X.ts
//   komga/src/test/kotlin/org/gotson/komga/<p>/XTest.kt  -> test/<p>/XTest.test.ts  (autres fichiers de test -> .ts)
// Chaque fichier TS commence par :  // @port-of <chemin kotlin>@<sha>
//
// Usage : node tools/port-status.mjs [--all] [--json]
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const UPSTREAM = join(ROOT, 'upstream')
const REF = readFileSync(join(ROOT, 'UPSTREAM_REF'), 'utf8').trim()
const args = new Set(process.argv.slice(2))

const MAPPINGS = [
  { from: 'komga/src/main/kotlin/org/gotson/komga/', to: 'src/', ext: '.ts', kind: 'main' },
  { from: 'komga/src/flyway/kotlin/', to: 'src/flyway/', ext: '.ts', kind: 'main' },
  { from: 'komga/src/test/kotlin/org/gotson/komga/', to: 'test/', ext: '.test.ts', kind: 'test' },
]

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

function git(...a) {
  return execFileSync('git', ['-C', UPSTREAM, ...a], { encoding: 'utf8' })
}

// Retire commentaires et littéraux chaîne pour compter les accolades.
function stripCode(line) {
  return line
    .replace(/\/\/.*$/, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`[^`]*`/g, '``')
}

// Extrait les tests Kotlin : { path: ['Nested', ...], name }
function kotlinTests(src) {
  const tests = []
  const stack = [] // { name, depth }
  let depth = 0
  let pendingTest = false
  let pendingNested = false
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (/^@(Test|ParameterizedTest|ArchTest)\b/.test(line)) pendingTest = true
    if (/^@Nested\b/.test(line)) pendingNested = true
    const cls = line.match(/\bclass\s+(\w+)/)
    if (pendingNested && cls) {
      stack.push({ name: cls[1], depth })
      pendingNested = false
    }
    const fn = line.match(/\bfun\s+(?:`([^`]+)`|(\w+))\s*\(/) ?? line.match(/\bval\s+(?:`([^`]+)`|(\w+))\s*[:=]/)
    if (pendingTest && fn) {
      tests.push({ path: stack.map((s) => s.name), name: fn[1] ?? fn[2] })
      pendingTest = false
    }
    for (const c of stripCode(raw)) {
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        while (stack.length && stack.at(-1).depth >= depth) stack.pop()
      }
    }
  }
  return tests
}

function countLiteral(src, s) {
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (src.match(new RegExp(`(['"\`])${esc}\\1`, 'g')) ?? []).length
}

const changedSince = new Map() // sha -> Set(paths changed between sha and REF)
function isStale(ktPath, sha) {
  if (sha === REF) return false
  if (!changedSince.has(sha)) {
    let out = ''
    try {
      out = git('diff', '--name-only', `${sha}..${REF}`)
    } catch {
      out = null
    }
    changedSince.set(sha, out === null ? null : new Set(out.split('\n')))
  }
  const set = changedSince.get(sha)
  return set === null ? true : set.has(ktPath)
}

const rows = []
for (const m of MAPPINGS) {
  for (const abs of walk(join(UPSTREAM, m.from)).filter((f) => f.endsWith('.kt'))) {
    const kt = relative(UPSTREAM, abs)
    const ts = m.to + kt.slice(m.from.length).replace(/\.kt$/, m.kind === 'test' && !/Tests?\.kt$/.test(kt) ? '.ts' : m.ext)
    const ktSrc = readFileSync(abs, 'utf8')
    const row = { kind: m.kind, kt, ts, ktLines: ktSrc.split('\n').length, status: 'missing' }
    const tsAbs = join(ROOT, ts)
    if (existsSync(tsAbs)) {
      const tsSrc = readFileSync(tsAbs, 'utf8')
      const header = tsSrc.match(/@port-of\s+(\S+)@([0-9a-f]{7,40})/)
      if (!header || header[1] !== kt) row.status = 'bad-header'
      else row.status = isStale(kt, header[2]) ? 'stale' : 'ok'
      row.sha = header?.[2]
      if (m.kind === 'test') {
        const expected = kotlinTests(ktSrc)
        const need = new Map()
        for (const t of expected) need.set(t.name, (need.get(t.name) ?? 0) + 1)
        row.missingTests = [...need].filter(([n, c]) => countLiteral(tsSrc, n) < c).map(([n]) => n)
        row.testCount = expected.length
        if (row.status === 'ok' && row.missingTests.length) row.status = 'tests-missing'
      }
    } else if (m.kind === 'test') {
      row.testCount = kotlinTests(ktSrc).length
    }
    rows.push(row)
  }
}

if (args.has('--json')) {
  process.stdout.write(JSON.stringify({ ref: REF, rows }, null, 2) + '\n')
} else {

const by = (k, s) => rows.filter((r) => r.kind === k && (s === undefined || r.status === s))
const sum = (a, f) => a.reduce((n, r) => n + (f(r) ?? 0), 0)
for (const kind of ['main', 'test']) {
  const all = by(kind)
  const ok = by(kind, 'ok')
  console.log(
    `${kind.padEnd(5)} fichiers ${ok.length}/${all.length}  lignes ${sum(ok, (r) => r.ktLines)}/${sum(all, (r) => r.ktLines)}` +
      (kind === 'test'
        ? `  tests ${sum(all, (r) => (r.status === 'missing' ? 0 : r.testCount - r.missingTests.length))}/${sum(all, (r) => r.testCount)}`
        : ''),
  )
}
const problems = rows.filter((r) => r.status !== 'ok' && (args.has('--all') || r.status !== 'missing'))
for (const r of problems) {
  console.log(`  [${r.status}] ${r.ts}  <-  ${r.kt}`)
  for (const t of r.missingTests ?? []) console.log(`      test manquant : ${t}`)
}
process.exitCode = rows.some((r) => ['stale', 'bad-header', 'tests-missing'].includes(r.status)) ? 1 : 0
}
