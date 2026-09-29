// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/datasource/DataSourcesConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { availableParallelism } from 'node:os'
import { configuration } from '../../port/spring.js'
import { type DataSource, HikariDataSource, JournalMode, SQLiteDataSource } from '../../port/sqlite.js'
import { KomgaProperties } from '../configuration/KomgaProperties.js'
import { SqliteUdfDataSource } from './SqliteUdfDataSource.js'

export class DataSourcesConfiguration {
  constructor(private readonly komgaProperties: KomgaProperties) {}

  sqliteDataSourceRW(): DataSource {
    const ds = this.buildDataSource('SqliteMainPoolRW', SqliteUdfDataSource, this.komgaProperties.database)
    // force pool size to 1 if the pool is only used for writes
    if (this.shouldSeparateReadFromWrites(this.komgaProperties.database)) ds.maximumPoolSize = 1
    return ds
  }

  sqliteDataSourceRO(): DataSource {
    if (this.shouldSeparateReadFromWrites(this.komgaProperties.database))
      return this.buildDataSource('SqliteMainPoolRO', SqliteUdfDataSource, this.komgaProperties.database)
    else return this.sqliteDataSourceRW()
  }

  tasksDataSourceRW(): DataSource {
    const ds = this.buildDataSource('SqliteTasksPoolRW', SQLiteDataSource, this.komgaProperties.tasksDb)
    // PORT: file des tâches en WAL avec synchronous NORMAL (sqlite-jdbc : FULL) : chaque tâche prise, supprimée ou émise
    // est une transaction, et FULL synchronise le disque à chacune ; sur le thread unique de KomgaJS ces attentes
    // bloquaient le serveur (plusieurs dizaines de ms par tâche sur une carte SD). Seul effet : après une coupure de
    // courant (pas un arrêt du processus), les dernières tâches enregistrées peuvent manquer, comme si elles n'avaient pas
    // été émises (le scan suivant les réémet). La base principale reste en FULL. Réglable par komga.tasks-db.pragmas
    ds.dataSource.config.walSynchronous = 'NORMAL'
    // pool size is always 1:
    // - if there's only 1 pool for read and writes, size should be 1
    // - if there's a separate read pool, the write pool size should be 1
    ds.maximumPoolSize = 1
    return ds
  }

  tasksDataSourceRO(): DataSource {
    if (this.shouldSeparateReadFromWrites(this.komgaProperties.tasksDb)) {
      const ds = this.buildDataSource('SqliteTasksPoolRO', SQLiteDataSource, this.komgaProperties.tasksDb)
      // PORT: synchronous NORMAL, voir tasksDataSourceRW
      ds.dataSource.config.walSynchronous = 'NORMAL'
      return ds
    } else return this.tasksDataSourceRW()
  }

  private buildDataSource(poolName: string, dataSourceClass: new () => SQLiteDataSource, databaseProps: KomgaProperties.Database): HikariDataSource {
    const extraPragmas =
      databaseProps.pragmas.size === 0
        ? ''
        : '?' +
          [...databaseProps.pragmas]
            .map(([key, value]) => `${key}=${value}`)
            .join('&')

    const dataSource = new dataSourceClass()
    dataSource.setUrl(`jdbc:sqlite:${databaseProps.file}${extraPragmas}`)

    dataSource.setEnforceForeignKeys(true)
    dataSource.setGetGeneratedKeys(false)
    if (databaseProps.journalMode !== null) dataSource.setJournalMode(databaseProps.journalMode.name)
    if (databaseProps.busyTimeout !== null) dataSource.config.busyTimeout = databaseProps.busyTimeout.toMillis()

    const poolSize = this.isMemory(databaseProps)
      ? 1
      : databaseProps.poolSize !== null
        ? databaseProps.poolSize
        : Math.min(availableParallelism(), databaseProps.maxPoolSize)

    // PORT: HikariConfig(dataSource, poolName, maximumPoolSize) ; Node mono-thread : une connexion par « pool »
    const hikari = new HikariDataSource(dataSource)
    hikari.poolName = poolName
    hikari.maximumPoolSize = poolSize
    return hikari
  }

  isMemory(self: KomgaProperties.Database): boolean {
    return self.file.includes(':memory:') || self.file.includes('mode=memory')
  }

  shouldSeparateReadFromWrites(self: KomgaProperties.Database): boolean {
    return !this.isMemory(self) && self.journalMode === JournalMode.WAL
  }
}

// PORT: HikariDataSource est aussi enregistré sous le nom de la méthode @Bean
configuration(DataSourcesConfiguration, {
  inject: [KomgaProperties],
  beans: [
    { method: 'sqliteDataSourceRW', type: HikariDataSource, primary: true },
    { method: 'sqliteDataSourceRO', type: HikariDataSource },
    { method: 'tasksDataSourceRW', type: HikariDataSource },
    { method: 'tasksDataSourceRO', type: HikariDataSource },
  ],
})
