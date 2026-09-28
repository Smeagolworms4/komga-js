// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/configuration/KomgaPropertiesOracleTest.kt
import { existsSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { KomgaProperties } from '../../../../src/infrastructure/configuration/KomgaProperties.js'
import { oracle, tempDir } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/configuration/KomgaProperties')

function makeDirs(database: string, tasks: string): unknown {
  const p = new KomgaProperties()
  p.database.file = database
  p.tasksDb.file = tasks
  return (p as unknown as { makeDirs(): unknown }).makeDirs()
}
const isDirectory = (p: string) => statSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false
const t = (p: string) => join(tempDir(), p)

func('makeDirs', () => {
  kase('both parents created', () => {
    const r = makeDirs(t('a/b/database.sqlite'), t('c/tasks.sqlite'))
    return [r, isDirectory(t('a/b')), isDirectory(t('c')), existsSync(t('a/b/database.sqlite'))]
  })
  kase('existing parents', () => makeDirs(t('a/b/database.sqlite'), t('a/tasks.sqlite')))
  kase('no parent stops silently', () => {
    const r = makeDirs('database.sqlite', t('d/tasks.sqlite'))
    return [r, existsSync(t('d'))]
  })
  kase('empty file names', () => makeDirs('', ''))
  kase('parent is a file', () => {
    writeFileSync(t('file'), 'x')
    const r = makeDirs(t('file/sub/database.sqlite'), t('e/tasks.sqlite'))
    return [r, existsSync(t('e'))]
  })
  kase('memory database', () => {
    const r = makeDirs(':memory:', t('f/g/tasks.sqlite'))
    return [r, isDirectory(t('f/g'))]
  })
  kase('unicode path', () => {
    const r = makeDirs(t('données 漫画/db.sqlite'), t('données 漫画/t.sqlite'))
    return [r, isDirectory(t('données 漫画'))]
  })
})
