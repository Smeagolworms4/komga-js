#!/usr/bin/env node
// Génère resources/git.properties pour KomgaJS, comme le plugin gradle-git-properties le fait pour le jar de Komga :
// /actuator/info en expose la branche et le commit (komga-webui affiche `v{version}-{git.branch}`).
// Source : GIT_BRANCH / GIT_COMMIT / GIT_COMMIT_TIME (build Docker, où .git n'est pas copié), sinon le dépôt git local.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

const branch = process.env.GIT_BRANCH || git('rev-parse', '--abbrev-ref', 'HEAD')
const commit = process.env.GIT_COMMIT || git('rev-parse', 'HEAD')
const time = process.env.GIT_COMMIT_TIME || git('log', '-1', '--format=%cI')

const out = join(root, 'resources', 'git.properties')
if (!branch || !commit) {
  console.warn('git.properties: no git information (set GIT_BRANCH and GIT_COMMIT), /actuator/info will have no git block')
  writeFileSync(out, '# no git information at build time\n')
} else {
  // format de gradle-git-properties : `:` échappé, date avec décalage sans `:`
  const t = time.replace(/([+-]\d{2}):(\d{2})$/, '$1$2').replace(/Z$/, '+0000').replace(/:/g, '\\:')
  writeFileSync(
    out,
    [`git.branch=${branch}`, `git.commit.id=${commit}`, `git.commit.id.abbrev=${commit.slice(0, 7)}`, time ? `git.commit.time=${t}` : null]
      .filter((l) => l !== null)
      .join('\n') + '\n',
  )
  console.log(`git.properties: ${branch} ${commit.slice(0, 7)}`)
}
