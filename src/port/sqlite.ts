// Support de portage : équivalents de org.sqlite.SQLiteDataSource / SQLiteConfig (sqlite-jdbc)
// et de com.zaxxer.hikari.HikariDataSource, sur better-sqlite3.
// Node est mono-thread : un « pool » est une connexion unique ouverte à la demande.
// Ce fichier n'a pas de jumeau Kotlin.
import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KEnum } from './kotlin.js'
import { commitWriteBatch, enableWriteBatching } from './sqlite-write-batch.js'

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

/** `HikariConfig.connectionTimeout` par défaut (ms) */
const HIKARI_CONNECTION_TIMEOUT = 30_000

export class SQLiteConfig {
  enforceForeignKeys = false
  journalMode: string | null = null
  /** sqlite-jdbc : busy_timeout par défaut 3000 ms */
  busyTimeout = 3000
  /** `synchronous` en mode WAL (sqlite-jdbc : FULL) */
  walSynchronous: 'FULL' | 'NORMAL' = 'FULL'
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
    // sqlite-jdbc est compilé avec SQLITE_DEFAULT_CACHE_SIZE=-2000 (2 Mo par connexion) et
    // SQLITE_DEFAULT_WAL_SYNCHRONOUS=2 (FULL) ; better-sqlite3 avec -16000 (16 Mo) et 1 (NORMAL) : on aligne sur Komga
    db.pragma('cache_size = -2000')
    // PORT: dans Komga, les threads se partagent la connexion d'écriture (pool Hikari de taille 1) et attendent qu'elle se
    // libère jusqu'à connectionTimeout (30 s). Ici le worker des tâches a sa propre connexion (port/task-worker.ts) :
    // l'attente se fait sur le verrou de SQLite, au moins aussi longtemps
    db.pragma(`busy_timeout = ${Math.max(this.config.busyTimeout, HIKARI_CONNECTION_TIMEOUT)}`)
    db.pragma(`foreign_keys = ${this.config.enforceForeignKeys ? 'ON' : 'OFF'}`)
    if (this.config.journalMode) db.pragma(`journal_mode = ${this.config.journalMode}`)
    if (String(db.pragma('journal_mode', { simple: true })).toUpperCase() === 'WAL') db.pragma(`synchronous = ${this.config.walSynchronous}`)
  }
}

/** `com.zaxxer.hikari.HikariDataSource` : connexion unique, ouverte au premier usage */
export class HikariDataSource {
  poolName = ''
  maximumPoolSize = 1
  private connection: Database.Database | null = null

  constructor(readonly dataSource: SQLiteDataSource) {}

  getConnection(): Database.Database {
    if (!this.connection || !this.connection.open) {
      this.connection = this.dataSource.openConnection()
      // PORT: écart — écritures des tâches regroupées par lots sur la connexion d'écriture de la base principale
      // (port/sqlite-write-batch.ts ; KOMGAJS_WRITE_BATCH_MS=0 : une validation par écriture, comme Komga)
      if (this.poolName === 'SqliteMainPoolRW') enableWriteBatching(this.connection)
    }
    return this.connection
  }

  close(): void {
    // PORT: lot d'écritures en cours validé avant la fermeture (port/sqlite-write-batch.ts)
    if (this.connection?.open) commitWriteBatch(this.connection)
    this.connection?.close()
    this.connection = null
  }
}

/** `javax.sql.DataSource` */
export type DataSource = HikariDataSource
