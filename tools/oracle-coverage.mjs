#!/usr/bin/env node
// Couverture des fonctions Kotlin par les tests unitaires à oracle (test/unit/, voir PORTING.md).
// Une fonction de coverage-baseline/kotlin-functions.json est couverte quand la fixture de son fichier
// (test/unit/fixtures/<paquet>/<Fichier>.json) contient au moins un cas "<nom>: ..." (ou "<nom>@<ligne>: ...").
//
// Usage : node tools/oracle-coverage.mjs [--missing [préfixe]] [--json]
//   --missing [préfixe]  liste des fonctions sans cas (éventuellement limitée aux fichiers sous <préfixe>, ex. domain/model)
//   --json               résultat détaillé en JSON
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const FIXTURES = join(ROOT, 'test/unit/fixtures')
const args = process.argv.slice(2)
const json = args.includes('--json')
const mi = args.indexOf('--missing')
const missingPrefix = mi >= 0 ? (args[mi + 1] && !args[mi + 1].startsWith('--') ? args[mi + 1] : '') : null

/** chemin relatif d'un fichier Kotlin de l'inventaire : "domain/model/Author" ou "flyway/db/migration/..." */
function kotlinRel(file) {
  const m = /^src\/main\/kotlin\/org\/gotson\/komga\/(.*)\.kt$/.exec(file)
  if (m) return m[1]
  return file.replace(/^src\/flyway\/kotlin\//, 'flyway/').replace(/\.kt$/, '')
}

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : []
  })
}

const inventory = JSON.parse(readFileSync(join(ROOT, 'coverage-baseline/kotlin-functions.json'), 'utf8'))
const withCode = inventory.filter((f) => !f.state.startsWith('sans code'))

// fixture -> fonctions citées (nom, ligne facultative)
const cited = new Map()
for (const f of walk(FIXTURES)) {
  const rel = relative(FIXTURES, f).replace(/\.json$/, '')
  const names = new Map()
  for (const key of Object.keys(JSON.parse(readFileSync(f, 'utf8')))) {
    const fn = key.slice(0, key.indexOf(': '))
    const [name, line] = fn.split('@')
    names.set(fn, { name, line: line === undefined ? null : Number(line), cases: (names.get(fn)?.cases ?? 0) + 1 })
  }
  cited.set(rel, names)
}

const covered = new Set()
const unknown = []
for (const [rel, names] of cited) {
  const fns = withCode.filter((f) => kotlinRel(f.file) === rel)
  for (const [fn, { name, line }] of names) {
    const hits = fns.filter((f) => f.name === name && (line === null || f.line === line))
    if (hits.length === 0) unknown.push(`${rel}: ${fn}`)
    hits.forEach((h) => covered.add(h))
  }
}
const noTwin = [...cited.keys()].filter((rel) => !existsSync(join(ROOT, 'test/unit', `${rel}.test.ts`)))

const byPkg = new Map()
for (const f of withCode) {
  const pkg = kotlinRel(f.file).split('/').slice(0, -1).join('/') || '.'
  const e = byPkg.get(pkg) ?? { total: 0, covered: 0 }
  e.total++
  if (covered.has(f)) e.covered++
  byPkg.set(pkg, e)
}

if (json) {
  console.log(
    JSON.stringify(
      {
        total: withCode.length,
        covered: covered.size,
        packages: Object.fromEntries([...byPkg].sort()),
        missing: withCode.filter((f) => !covered.has(f)).map((f) => ({ file: kotlinRel(f.file), line: f.line, name: f.name })),
        unknownOracleFunctions: unknown,
        fixturesWithoutTwin: noTwin,
      },
      null,
      1,
    ),
  )
} else if (missingPrefix !== null) {
  for (const f of withCode) if (!covered.has(f) && kotlinRel(f.file).startsWith(missingPrefix)) console.log(`${kotlinRel(f.file)}.kt:${f.line} ${f.name}`)
} else {
  const pct = (a, b) => `${((100 * a) / b).toFixed(1)} %`
  console.log(`Fonctions Kotlin avec du code : ${withCode.length}, couvertes par un oracle : ${covered.size} (${pct(covered.size, withCode.length)})`)
  console.log(`Fixtures : ${cited.size} fichiers, ${[...cited.values()].reduce((n, m) => n + [...m.values()].reduce((a, v) => a + v.cases, 0), 0)} cas\n`)
  for (const [pkg, e] of [...byPkg].sort()) {
    if (e.covered > 0) console.log(`${String(e.covered).padStart(4)} / ${String(e.total).padEnd(4)} ${pkg}`)
  }
  const untouched = [...byPkg].filter(([, e]) => e.covered === 0)
  console.log(`\n${untouched.length} paquets sans oracle (${untouched.reduce((n, [, e]) => n + e.total, 0)} fonctions) ; détail : --missing [paquet]`)
  if (unknown.length) console.log(`\nFonctions d'oracle hors inventaire (constructeurs, entries, fonctions privées...) :\n  ${unknown.join('\n  ')}`)
  if (noTwin.length) {
    console.log(`\nFixtures sans test TypeScript jumeau :\n  ${noTwin.join('\n  ')}`)
    process.exitCode = 1
  }
}
