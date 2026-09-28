#!/usr/bin/env node
// Montre ce qu'il faut reporter quand Komga évolue.
// Pour chaque fichier Kotlin/SQL modifié entre UPSTREAM_REF et <nouvelle-ref>,
// affiche le fichier TS jumeau et le diff Kotlin à reporter.
//
// Usage : node tools/upstream-diff.mjs <nouvelle-ref> [--stat]
//   (faire d'abord `git -C upstream fetch --tags origin`)
// Une fois reporté : mettre à jour les en-têtes @port-of puis UPSTREAM_REF.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const UPSTREAM = join(ROOT, 'upstream')
const REF = readFileSync(join(ROOT, 'UPSTREAM_REF'), 'utf8').trim()
const [target, flag] = process.argv.slice(2)
if (!target) {
  console.error('usage: upstream-diff.mjs <nouvelle-ref> [--stat]')
  process.exit(2)
}

const git = (...a) => execFileSync('git', ['-C', UPSTREAM, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 })

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

const changes = git('diff', '--name-status', `${REF}..${target}`, '--', 'komga/')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => l.split('\t'))

console.log(`# Komga ${REF.slice(0, 10)} -> ${target}  (${changes.length} fichiers backend)\n`)
for (const [status, ...paths] of changes) {
  const p = paths.at(-1)
  const t = twin(p)
  console.log(`## [${status}] ${p}\n   -> ${t ?? '(hors périmètre : build/config, à examiner à la main)'}`)
  if (flag !== '--stat') console.log(git('diff', `${REF}..${target}`, '--', ...paths))
}
