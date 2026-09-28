// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/util/TempDirectoryCheckerOracleTest.kt
import { chmodSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkTempDirectory } from '../../../../src/infrastructure/util/TempDirectoryChecker.js'
import { oracle, tempDir } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/util/TempDirectoryChecker')

/** Exécute `block` avec TMPDIR (java.io.tmpdir côté Kotlin) = `dir`, chemins temporaires masqués dans les messages */
function withTmp(dir: string, block: () => unknown): unknown {
  const previous = process.env.TMPDIR
  process.env.TMPDIR = dir
  try {
    return block()
  } catch (e) {
    return [(e as Error).name, (e as Error).message.replaceAll(tempDir(), '<tmp>')]
  } finally {
    process.env.TMPDIR = previous
  }
}

func('checkTempDirectory', () => {
  kase('existing directory', () => {
    const dir = join(tempDir(), 'existing')
    mkdirSync(dir, { recursive: true })
    return withTmp(dir, () => checkTempDirectory())
  })
  kase('missing directory is created', () => {
    const dir = join(tempDir(), 'missing/nested dir')
    return [withTmp(dir, () => checkTempDirectory()), existsSync(dir), statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false]
  })
  kase('trailing slash', () => withTmp(join(tempDir(), 'slash') + '/', () => checkTempDirectory()))
  kase('cannot be created under a file', () => {
    const f = join(tempDir(), 'a-file')
    writeFileSync(f, 'x')
    return withTmp(join(f, 'sub'), () => checkTempDirectory())
  })
  kase('not writable', () => {
    const ro = join(tempDir(), 'read-only')
    mkdirSync(ro, { recursive: true })
    chmodSync(ro, 0o555)
    try {
      return withTmp(ro, () => checkTempDirectory())
    } finally {
      chmodSync(ro, 0o755)
    }
  })
  kase('unicode directory', () => withTmp(join(tempDir(), 'dossier été 漫画'), () => checkTempDirectory()))
})
