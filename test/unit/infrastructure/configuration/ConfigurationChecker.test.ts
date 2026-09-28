// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/configuration/ConfigurationCheckerOracleTest.kt
// Seuls des systèmes de fichiers locaux sont disponibles : chaque vérification passe (Unit)
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ConfigurationChecker } from '../../../../src/infrastructure/configuration/ConfigurationChecker.js'
import { KomgaProperties } from '../../../../src/infrastructure/configuration/KomgaProperties.js'
import { oracle, tempDir } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/configuration/ConfigurationChecker')

function check(database: string, tasks: string = database, checkDatabase = true, checkTasks = true): unknown {
  try {
    const p = new KomgaProperties()
    p.database.file = database
    p.database.checkLocalFilesystem = checkDatabase
    p.tasksDb.file = tasks
    p.tasksDb.checkLocalFilesystem = checkTasks
    return new ConfigurationChecker(p).checkDatabasesPath()
  } catch (e) {
    return [(e as Error).name, (e as Error).message.replaceAll(tempDir(), '<tmp>')]
  }
}

mkdirSync(join(tempDir(), 'db'), { recursive: true })
const existing = join(tempDir(), 'db/database.sqlite')
writeFileSync(existing, '')
const missing = join(tempDir(), 'db/missing.sqlite')

func('checkDatabasesPath', () => {
  kase('existing files', () => check(existing))
  kase('missing file, existing parent', () => check(missing))
  kase('missing parent', () => check(join(tempDir(), 'nope/nope/db.sqlite')))
  kase('checks disabled', () => check(existing, existing, false, false))
  kase('default empty file', () => check(''))
})
func('checkDatabaseIsLocal', () => {
  kase('relative path without parent', () => check('database.sqlite'))
  kase('memory database', () => check(':memory:'))
  kase('file uri', () => check(`file:${existing}?mode=ro`))
  kase('nul character', () => check('a\u0000b'))
  kase('only tasks checked', () => check(existing, missing, false))
})
func('checkIfRemote', () => {
  kase('directory', () => check(tempDir()))
  kase('root', () => check('/'))
  kase('proc file', () => check('/proc/self/mounts'))
})
