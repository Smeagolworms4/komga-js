#!/usr/bin/env node
// Rapport Markdown de ce qu'une nouvelle version de Komga change, pour l'issue ouverte par
// .github/workflows/upstream-watch.yml (et utilisable à la main).
//
// Usage : node tools/upstream-report.mjs <nouvelle-ref> [--release-json <fichier>]
//   Base : UPSTREAM_REF, ou la variable d'environnement UPSTREAM_BASE (essai contre une révision plus ancienne).
//   upstream/ doit être un clone de gotson/komga avec les tags (voir upstream-diff.mjs).
//   --release-json : sortie de `gh api repos/gotson/komga/releases/tags/<tag>` (date, lien, notes de version).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const UPSTREAM = join(ROOT, 'upstream')
const BASE = (process.env.UPSTREAM_BASE || readFileSync(join(ROOT, 'UPSTREAM_REF'), 'utf8')).trim()
const args = process.argv.slice(2)
const target = args[0]
if (!target) {
  console.error('usage: upstream-report.mjs <nouvelle-ref> [--release-json <fichier>]')
  process.exit(2)
}
const releaseJsonIdx = args.indexOf('--release-json')
const release = releaseJsonIdx > 0 ? JSON.parse(readFileSync(args[releaseJsonIdx + 1], 'utf8')) : null

const git = (...a) => execFileSync('git', ['-C', UPSTREAM, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 })

// même correspondance que tools/upstream-diff.mjs
const MAPPINGS = [
  ['komga/src/main/kotlin/org/gotson/komga/', 'src/', '.ts'],
  ['komga/src/flyway/kotlin/', 'src/flyway/', '.ts'],
  ['komga/src/test/kotlin/org/gotson/komga/', 'test/', '.test.ts'],
]
const twin = (p) => {
  for (const [from, to, ext] of MAPPINGS)
    if (p.startsWith(from)) return to + p.slice(from.length).replace(/\.kt$/, ext === '.test.ts' && !/Tests?\.kt$/.test(p) ? '.ts' : ext)
  if (p.startsWith('komga/src/flyway/resources/')) return 'resources/' + p.slice('komga/src/flyway/resources/'.length)
  if (p.startsWith('komga/src/main/resources/')) return 'resources/' + p.slice('komga/src/main/resources/'.length)
  if (p.startsWith('komga/src/test/resources/')) return 'test/resources/' + p.slice('komga/src/test/resources/'.length)
  return null
}

const range = `${BASE}..${target}`
const status = new Map(
  git('diff', '--no-renames', '--name-status', range, '--', 'komga/', 'komga-webui/', 'next-ui/')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [s, p] = l.split('\t')
      return [p, s]
    }),
)
const files = git('diff', '--no-renames', '--numstat', range, '--', 'komga/', 'komga-webui/', 'next-ui/')
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    const [a, d, path] = l.split('\t')
    // fichiers binaires : "-"
    return { path, status: status.get(path) ?? '?', added: a === '-' ? 0 : Number(a), deleted: d === '-' ? 0 : Number(d), binary: a === '-' }
  })

const commits = git('rev-list', '--count', range).trim()
const baseName = (() => {
  try {
    return git('describe', '--tags', BASE).trim()
  } catch {
    return BASE.slice(0, 10)
  }
})()

const isKotlinMain = (p) => (p.startsWith('komga/src/main/kotlin/') || p.startsWith('komga/src/flyway/kotlin/')) && p.endsWith('.kt')
const isKotlinTest = (p) => p.startsWith('komga/src/test/kotlin/') && p.endsWith('.kt')
const isMigration = (p) => p.startsWith('komga/src/flyway/')
const kotlinMain = files.filter((f) => isKotlinMain(f.path))
const kotlinTests = files.filter((f) => isKotlinTest(f.path))
const migrations = files.filter((f) => isMigration(f.path) && f.status === 'A')
const otherBackend = files.filter((f) => f.path.startsWith('komga/') && !isKotlinMain(f.path) && !isKotlinTest(f.path) && !(isMigration(f.path) && f.status === 'A'))
const webui = files.filter((f) => f.path.startsWith('komga-webui/'))
const nextui = files.filter((f) => f.path.startsWith('next-ui/'))

const sum = (l) => l.reduce((a, f) => [a[0] + f.added, a[1] + f.deleted], [0, 0])
const lines = (l) => {
  const [a, d] = sum(l)
  return `+${a} / −${d}`
}
const STATUS = { A: 'added', M: 'modified', D: 'deleted', T: 'type changed' }
const cell = (s) => String(s).replace(/\|/g, '\\|')

const out = []
const MAX_BODY = 60_000
const push = (s = '') => out.push(s)

const baseText = process.env.UPSTREAM_BASE
  ? `Compared from \`${baseName}\` (\`${BASE.slice(0, 12)}\`, \`UPSTREAM_BASE\`), not from \`UPSTREAM_REF\`.`
  : `KomgaJS ports \`${baseName}\` (\`UPSTREAM_REF\` = \`${BASE.slice(0, 12)}\`).`
push(`Komga **${target}** is out${release?.published_at ? ` (${release.published_at.slice(0, 10)})` : ''}. ${baseText}`)
if (release?.html_url) push(`Release: ${release.html_url}`)
push()
push(`${commits} upstream commits, ${files.length} files changed in \`komga/\`, \`komga-webui/\` and \`next-ui/\`.`)
push()
push('| Area | Files | Lines |')
push('|---|---:|---:|')
push(`| Kotlin (main + flyway) | ${kotlinMain.length} | ${lines(kotlinMain)} |`)
push(`| Kotlin tests | ${kotlinTests.length} | ${lines(kotlinTests)} |`)
push(`| DB migrations added | ${migrations.length} | ${lines(migrations)} |`)
push(`| Other backend files (resources, build, docs) | ${otherBackend.length} | ${lines(otherBackend)} |`)
push(`| komga-webui | ${webui.length} | ${lines(webui)} |`)
push(`| next-ui | ${nextui.length} | ${lines(nextui)} |`)
push()

const table = (title, list, withTwin, label = 'Kotlin') => {
  push(`### ${title}`)
  push()
  if (list.length === 0) {
    push('_None._')
    push()
    return
  }
  push(withTwin ? `| Status | ${label} | TypeScript twin | Lines |` : '| Status | File | Lines |')
  push(withTwin ? '|---|---|---|---:|' : '|---|---|---:|')
  for (const f of [...list].sort((a, b) => a.path.localeCompare(b.path))) {
    const t = twin(f.path)
    const tsCell = t === null ? '_(none)_' : `\`${t}\`${existsSync(join(ROOT, t)) ? '' : f.status === 'A' ? ' _(new)_' : ' _(missing)_'}`
    const l = f.binary ? 'binary' : `+${f.added} / −${f.deleted}`
    push(withTwin ? `| ${STATUS[f.status] ?? f.status} | \`${cell(f.path)}\` | ${tsCell} | ${l} |` : `| ${STATUS[f.status] ?? f.status} | \`${cell(f.path)}\` | ${l} |`)
  }
  push()
}

table('Kotlin files to port', kotlinMain, true)
table('Kotlin tests', kotlinTests, true)
table('DB migrations added', migrations, true, 'Migration')
table('Other backend files', otherBackend, true, 'File')

// Interfaces web : servies telles quelles (construites depuis UPSTREAM_REF par le Dockerfile) : résumé par dossier
const uiSummary = (name, list) => {
  push(`### ${name}`)
  push()
  if (list.length === 0) {
    push('_No change._')
    push()
    return
  }
  const byDir = new Map()
  for (const f of list) {
    const parts = f.path.split('/')
    const dir = parts.length > 3 ? parts.slice(0, 3).join('/') : parts.slice(0, -1).join('/') || parts[0]
    const e = byDir.get(dir) ?? { files: 0, added: 0, deleted: 0 }
    e.files++
    e.added += f.added
    e.deleted += f.deleted
    byDir.set(dir, e)
  }
  push(`${list.length} files, ${lines(list)} lines.`)
  push()
  push('| Directory | Files | Lines |')
  push('|---|---:|---:|')
  for (const [dir, e] of [...byDir].sort((a, b) => b[1].added + b[1].deleted - (a[1].added + a[1].deleted)))
    push(`| \`${cell(dir)}/\` | ${e.files} | +${e.added} / −${e.deleted} |`)
  const pkg = list.find((f) => /^(komga-webui|next-ui)\/package\.json$/.test(f.path))
  if (pkg) {
    const d = git('diff', range, '--', pkg.path)
      .split('\n')
      .filter((l) => /^[+-]\s+"/.test(l))
    if (d.length > 0) {
      push()
      push('<details><summary><code>package.json</code> changes</summary>')
      push()
      push('```diff')
      push(...d.slice(0, 80))
      push('```')
      push('</details>')
    }
  }
  push()
}
push('## Web UI')
push()
push('Served as is: the Docker image builds both UIs from `UPSTREAM_REF`, so bumping it ships them. Check the API calls they make against the ported backend.')
push()
uiSummary('komga-webui', webui)
uiSummary('next-ui', nextui)

push('## To do')
push()
push(`- [ ] \`git -C upstream fetch --tags origin && node tools/upstream-diff.mjs ${target}\` and port each Kotlin diff to its twin (\`// @port-of\` headers)`)
push('- [ ] port the Kotlin tests and regenerate the oracle fixtures that changed')
if (migrations.length > 0) push('- [ ] copy the new migrations to `resources/` and port the Kotlin ones')
push(`- [ ] set \`UPSTREAM_REF\` to \`${target}\`'s commit, \`node tools/port-status.mjs\` clean`)
push()

if (release?.body) {
  const notes = release.body.length > 12_000 ? `${release.body.slice(0, 12_000)}\n\n…` : release.body
  push('<details><summary>Release notes</summary>')
  push()
  push(notes)
  push()
  push('</details>')
  push()
}

push(`<sub>Generated by \`tools/upstream-report.mjs\` (workflow \`upstream-watch.yml\`).</sub>`)

let body = out.join('\n')
if (body.length > MAX_BODY) body = `${body.slice(0, MAX_BODY)}\n\n…(truncated: run \`node tools/upstream-report.mjs ${target}\` locally for the full report)`
process.stdout.write(`${body}\n`)
