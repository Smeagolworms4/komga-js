// Support de portage : équivalents de org.sqlite.SQLiteDataSource / SQLiteConfig (sqlite-jdbc)
// et de com.zaxxer.hikari.HikariDataSource, sur better-sqlite3.
// Node est mono-thread : un « pool » est une connexion unique ouverte à la demande.
// Ce fichier n'a pas de jumeau Kotlin.
import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KEnum } from './kotlin.js'

/** `org.sqlite.SQLiteConfig.JournalMode` */
export class JournalMode extends KEnum {
  static readonly DELETE = new JournalMode('DELETE')
  static readonly TRUNCATE = new JournalMode('TRUNCATE')
  static readonly PERSIST = new JournalMode('PERSIST')
  static readonly MEMORY = new JournalMode('MEMORY')
  static readonly WAL = new JournalMode('WAL')
  static readonly OFF = new JournalMode('OFF')
}

/** Extension native (collations ICU, DQS) : build/komgasqlite.so, voir native/komga_sqlite.c */
export function komgaSqliteExtensionPath(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  for (const p of [join(here, '../../build/komgasqlite.so'), join(here, '../../../build/komgasqlite.so'), join(process.cwd(), 'build/komgasqlite.so')])
    if (existsSync(p)) return p
  throw new Error('build/komgasqlite.so introuvable : lancer `npm run build:native`')
}

export class SQLiteConfig {
  enforceForeignKeys = false
  journalMode: string | null = null
  /** sqlite-jdbc : busy_timeout par défaut 3000 ms */
  busyTimeout = 3000
}

/** `org.sqlite.SQLiteDataSource` */
export class SQLiteDataSource {
  url = ''
  readonly config = new SQLiteConfig()

  setUrl(url: string): void {
    this.url = url
  }
  setEnforceForeignKeys(v: boolean): void {
    this.config.enforceForeignKeys = v
  }
  setGetGeneratedKeys(_v: boolean): void {}
  setJournalMode(mode: string): void {
    this.config.journalMode = mode
  }

  /** Ouvre une connexion : `jdbc:sqlite:<fichier>?pragma=valeur&...` */
  openConnection(): Database.Database {
    const spec = this.url.replace(/^jdbc:sqlite:/, '')
    const q = spec.indexOf('?')
    const file = q < 0 ? spec : spec.slice(0, q)
    const pragmas = new URLSearchParams(q < 0 ? '' : spec.slice(q + 1))
    const memory = file === ':memory:' || file === '' || pragmas.get('mode') === 'memory'
    const db = new Database(memory ? ':memory:' : file.replace(/^file:/, ''))
    this.configure(db)
    for (const [k, v] of pragmas) if (k !== 'mode' && k !== 'cache') db.pragma(`${k} = ${v}`)
    return db
  }

  /** Réglages appliqués par sqlite-jdbc à l'ouverture, puis getConnection() des sous-classes */
  protected configure(db: Database.Database): void {
    db.loadExtension(komgaSqliteExtensionPath())
    db.pragma(`busy_timeout = ${this.config.busyTimeout}`)
    db.pragma(`foreign_keys = ${this.config.enforceForeignKeys ? 'ON' : 'OFF'}`)
    if (this.config.journalMode) db.pragma(`journal_mode = ${this.config.journalMode}`)
  }
}

/** `com.zaxxer.hikari.HikariDataSource` : connexion unique, ouverte au premier usage */
export class HikariDataSource {
  poolName = ''
  maximumPoolSize = 1
  private connection: Database.Database | null = null

  constructor(readonly dataSource: SQLiteDataSource) {}

  getConnection(): Database.Database {
    if (!this.connection || !this.connection.open) this.connection = this.dataSource.openConnection()
    return this.connection
  }

  close(): void {
    this.connection?.close()
    this.connection = null
  }
}

/** `javax.sql.DataSource` */
export type DataSource = HikariDataSource
