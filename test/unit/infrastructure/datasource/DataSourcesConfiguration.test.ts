// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/datasource/DataSourcesConfigurationOracleTest.kt
import { join } from 'node:path'
import { Duration } from '@js-joda/core'
import { KomgaProperties } from '../../../../src/infrastructure/configuration/KomgaProperties.js'
import { DataSourcesConfiguration } from '../../../../src/infrastructure/datasource/DataSourcesConfiguration.js'
import { type DataSource, JournalMode } from '../../../../src/port/sqlite.js'
import { query } from '../../db.js'
import { oracle, tempDir } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/datasource/DataSourcesConfiguration')

function props(file: string, block: (it: KomgaProperties.Database) => void = () => {}): KomgaProperties {
  const p = new KomgaProperties()
  p.database.file = file
  block(p.database)
  p.tasksDb.file = file
  block(p.tasksDb)
  return p
}

const file = (name: string) => join(tempDir(), name)

/** nom et taille du pool, classe de la source, url, mode de journal, délai d'attente, clés étrangères */
function describe(ds: DataSource): unknown[] {
  const s = ds.dataSource
  const r = [ds.poolName, ds.maximumPoolSize, s.constructor.name, s.url.replaceAll(tempDir(), '<tmp>'), s.config.journalMode, s.config.busyTimeout, s.config.enforceForeignKeys]
  ds.close()
  return r
}

/** pragmas d'une connexion du pool */
function pragmas(ds: DataSource): unknown[] {
  try {
    const c = ds.getConnection()
    return ['journal_mode', 'foreign_keys', 'busy_timeout', 'cache_size', 'temp_store'].map((it) => (query(c, `pragma ${it}`)[0] as unknown[])[0])
  } finally {
    ds.close()
  }
}

const conf = (p: KomgaProperties) => new DataSourcesConfiguration(p)

func('sqliteDataSourceRW', () => {
  kase('memory', () => describe(conf(props(':memory:')).sqliteDataSourceRW()))
  kase('memory pragmas', () => pragmas(conf(props(':memory:')).sqliteDataSourceRW()))
  kase('memory mode url', () => describe(conf(props('file:komga?mode=memory&cache=shared')).sqliteDataSourceRW()))
  kase('file with WAL', () => describe(conf(props(file('wal.sqlite'), (it) => (it.poolSize = 4))).sqliteDataSourceRW()))
  kase('file with WAL pragmas', () => pragmas(conf(props(file('wal.sqlite'))).sqliteDataSourceRW()))
  kase('file with DELETE journal and pool size', () =>
    describe(
      conf(
        props(file('delete.sqlite'), (it) => {
          it.journalMode = JournalMode.DELETE
          it.poolSize = 3
        }),
      ).sqliteDataSourceRW(),
    ),
  )
  kase('file with DELETE journal pragmas', () => pragmas(conf(props(file('delete.sqlite'), (it) => (it.journalMode = JournalMode.DELETE))).sqliteDataSourceRW()))
  kase('file without journal mode', () => describe(conf(props(file('none.sqlite'), (it) => (it.journalMode = null))).sqliteDataSourceRW()))
  const withPragmas = (it: KomgaProperties.Database) => {
    it.pragmas = new Map([
      ['cache_size', '-4000'],
      ['temp_store', 'memory'],
    ])
  }
  kase('pragmas in url', () => describe(conf(props(':memory:', withPragmas)).sqliteDataSourceRW()))
  kase('pragmas applied', () => pragmas(conf(props(':memory:', withPragmas)).sqliteDataSourceRW()))
  kase('busy timeout in seconds', () => describe(conf(props(':memory:', (it) => (it.busyTimeout = Duration.ofSeconds(7)))).sqliteDataSourceRW()))
  kase('busy timeout in millis', () => describe(conf(props(':memory:', (it) => (it.busyTimeout = Duration.ofMillis(1500)))).sqliteDataSourceRW()))
  kase('busy timeout pragma', () => pragmas(conf(props(':memory:', (it) => (it.busyTimeout = Duration.ofSeconds(2)))).sqliteDataSourceRW()))
})

func('sqliteDataSourceRO', () => {
  kase('memory uses the RW configuration', () => describe(conf(props(':memory:')).sqliteDataSourceRO()))
  kase('file with WAL', () => describe(conf(props(file('wal.sqlite'), (it) => (it.poolSize = 4))).sqliteDataSourceRO()))
  kase('file with DELETE journal', () => describe(conf(props(file('delete.sqlite'), (it) => (it.journalMode = JournalMode.DELETE))).sqliteDataSourceRO()))
})

func('tasksDataSourceRW', () => {
  kase('memory', () => describe(conf(props(':memory:')).tasksDataSourceRW()))
  kase('file with pool size', () => describe(conf(props(file('tasks.sqlite'), (it) => (it.poolSize = 5))).tasksDataSourceRW()))
  kase('memory pragmas', () => pragmas(conf(props(':memory:')).tasksDataSourceRW()))
})

func('tasksDataSourceRO', () => {
  kase('memory uses the RW configuration', () => describe(conf(props(':memory:')).tasksDataSourceRO()))
  kase('file with WAL', () => describe(conf(props(file('tasks.sqlite'), (it) => (it.poolSize = 2))).tasksDataSourceRO()))
  kase('file with TRUNCATE journal', () => describe(conf(props(file('tasks.sqlite'), (it) => (it.journalMode = JournalMode.TRUNCATE))).tasksDataSourceRO()))
})

func('buildDataSource', () => {
  kase('main and tasks classes', () => {
    const c = conf(props(':memory:'))
    return [describe(c.sqliteDataSourceRW())[2], describe(c.tasksDataSourceRW())[2]]
  })
  kase('max pool size bounds the default', () => describe(conf(props(file('m.sqlite'), (it) => (it.journalMode = JournalMode.DELETE))).sqliteDataSourceRW())[1])
  kase('memory ignores pool size', () => describe(conf(props(':memory:', (it) => (it.poolSize = 8))).sqliteDataSourceRW())[1])
  kase('empty pragmas', () => describe(conf(props(file('x.sqlite'), (it) => (it.pragmas = new Map()))).sqliteDataSourceRW())[3])
  kase('single pragma', () => describe(conf(props(file('x.sqlite'), (it) => (it.pragmas = new Map([['a', 'b']])))).sqliteDataSourceRW())[3])
})

func('isMemory', () => {
  const files = [':memory:', 'file::memory:?cache=shared', 'file:x?mode=memory', '/data/database.sqlite', '', 'MEMORY', ':MEMORY:', 'a?mode=memoryX']
  for (const f of files) {
    kase(`'${f}'`, () => {
      const d = new KomgaProperties.Database()
      d.file = f
      return conf(new KomgaProperties()).isMemory(d)
    })
  }
})

func('shouldSeparateReadFromWrites', () => {
  const combos: [string, JournalMode | null][] = [
    [':memory:', JournalMode.WAL],
    ['/db.sqlite', JournalMode.WAL],
    ['/db.sqlite', JournalMode.DELETE],
    ['/db.sqlite', null],
    ['/db.sqlite', JournalMode.TRUNCATE],
    ['file:x?mode=memory', JournalMode.WAL],
  ]
  for (const [f, j] of combos) {
    kase(`${f} ${j === null ? 'null' : j.name}`, () => {
      const d = new KomgaProperties.Database()
      d.file = f
      d.journalMode = j
      return conf(new KomgaProperties()).shouldSeparateReadFromWrites(d)
    })
  }
})
