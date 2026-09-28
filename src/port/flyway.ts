// Support de portage : équivalent de Flyway (10.x) pour SQLite, tel que configuré par Komga :
// locations SQL + migrations "Java" (ici TS), mixed = true, placeholders ${...}, validateOnMigrate,
// migrations futures ignorées. Table flyway_schema_history identique (DDL et checksums CRC32),
// pour qu'une même base puisse être ouverte par Komga (JVM) et KomgaJS.
// Ce fichier n'a pas de jumeau Kotlin.
import type Database from 'better-sqlite3'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { crc32 } from 'node:zlib'
import { Exception } from './kotlin.js'
import { KotlinLogging } from './logging.js'

const logger = KotlinLogging.logger('org.flywaydb.core.Flyway')

export class FlywayException extends Exception {}

/** `org.flywaydb.core.api.migration.Context` */
export interface Context {
  readonly connection: Database.Database
}

/** `BaseJavaMigration` : la version et la description viennent du nom de classe `V<version>__<description>`. */
export abstract class BaseJavaMigration {
  abstract migrate(context: Context): void
}

type Resolved = {
  version: string
  description: string
  type: 'SQL' | 'JDBC'
  script: string
  checksum: number | null
  run: (db: Database.Database) => void
}

export type FlywayConfig = {
  /** Répertoires des scripts SQL `V<version>__<description>.sql` */
  sqlLocations: string[]
  /** Répertoires des migrations TS `V<version>__<description>.(ts|js)` exportant une classe du même nom */
  codeLocations?: string[]
  /** Paquet Java des migrations code, pour la colonne `script` (ex. `db.migration.sqlite`) */
  codePackage?: string
  placeholders?: Record<string, string>
}

const TABLE = 'flyway_schema_history'
const NAME = /^V([0-9._]+)__(.+)$/

function parseName(base: string): { version: string; description: string } | null {
  const m = NAME.exec(base)
  if (!m) return null
  return { version: (m[1] as string).replaceAll('_', '.'), description: (m[2] as string).replaceAll('_', ' ') }
}

/** Checksum Flyway : CRC32 de chaque ligne (sans fin de ligne, BOM retiré), sur le script avant placeholders. */
export function flywayChecksum(content: string): number {
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)
  const lines = content.split(/\r\n|\r|\n/)
  if (lines.at(-1) === '') lines.pop()
  let c = 0
  for (const l of lines) c = crc32(Buffer.from(l, 'utf8'), c)
  return c | 0
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(BigInt)
  const pb = b.split('.').map(BigInt)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0n
    const y = pb[i] ?? 0n
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

function replacePlaceholders(sql: string, placeholders: Record<string, string>, script: string): string {
  return sql.replace(/\$\{([^}]+)\}/g, (_, name: string) => {
    const v = placeholders[name]
    if (v === undefined) throw new FlywayException(`No value provided for placeholder: \${${name}} in ${script}`)
    return v
  })
}

export class Flyway {
  constructor(
    private readonly db: Database.Database,
    private readonly config: FlywayConfig,
  ) {}

  private async resolve(): Promise<Resolved[]> {
    const out: Resolved[] = []
    for (const dir of this.config.sqlLocations) {
      if (!existsSync(dir)) continue
      for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
        const n = parseName(f.slice(0, -4))
        if (!n) continue
        const content = readFileSync(join(dir, f), 'utf8')
        out.push({
          ...n,
          type: 'SQL',
          script: f,
          checksum: flywayChecksum(content),
          run: (db) => db.exec(replacePlaceholders(content, this.config.placeholders ?? {}, f)),
        })
      }
    }
    for (const dir of this.config.codeLocations ?? []) {
      if (!existsSync(dir)) continue
      for (const f of readdirSync(dir).filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'))) {
        const base = f.replace(/\.(ts|js)$/, '')
        const n = parseName(base)
        if (!n) continue
        const mod = (await import(pathToFileURL(join(dir, f)).href)) as Record<string, new () => BaseJavaMigration>
        const C = mod[base]
        if (!C) throw new FlywayException(`Migration class ${base} not exported by ${f}`)
        out.push({
          ...n,
          type: 'JDBC',
          script: this.config.codePackage ? `${this.config.codePackage}.${base}` : base,
          checksum: null,
          run: (db) => new C().migrate({ connection: db }),
        })
      }
    }
    out.sort((a, b) => compareVersions(a.version, b.version))
    for (let i = 1; i < out.length; i++)
      if (compareVersions((out[i - 1] as Resolved).version, (out[i] as Resolved).version) === 0)
        throw new FlywayException(`Found more than one migration with version ${(out[i] as Resolved).version}`)
    return out
  }

  private ensureTable(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS "${TABLE}" (
    "installed_rank" INT NOT NULL PRIMARY KEY,
    "version" VARCHAR(50),
    "description" VARCHAR(200) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "script" VARCHAR(1000) NOT NULL,
    "checksum" INT,
    "installed_by" VARCHAR(100) NOT NULL,
    "installed_on" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now')),
    "execution_time" INT NOT NULL,
    "success" BOOLEAN NOT NULL
)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS "${TABLE}_s_idx" ON "${TABLE}" ("success")`)
  }

  /** Applique les migrations en attente. Retourne le nombre de migrations appliquées. */
  async migrate(): Promise<number> {
    const resolved = await this.resolve()
    this.ensureTable()
    type Applied = { installed_rank: number; version: string | null; script: string; checksum: number | null; type: string; success: number }
    const applied = this.db.prepare(`SELECT installed_rank, version, script, checksum, type, success FROM "${TABLE}" ORDER BY installed_rank`).all() as Applied[]

    // validateOnMigrate
    const failed = applied.find((a) => a.success === 0)
    if (failed) throw new FlywayException(`Validate failed: Detected failed migration to version ${failed.version} (${failed.script})`)
    for (const a of applied) {
      if (a.version === null) continue
      const r = resolved.find((r) => compareVersions(r.version, a.version as string) === 0)
      if (!r) continue // migration future ou supprimée : ignorée (ignoreMigrationPatterns = *:future)
      if (r.type !== a.type) throw new FlywayException(`Validate failed: Migration type mismatch for migration version ${a.version}`)
      if (r.checksum !== a.checksum)
        throw new FlywayException(
          `Validate failed: Migration checksum mismatch for migration version ${a.version}\n-> Applied to database : ${a.checksum}\n-> Resolved locally    : ${r.checksum}`,
        )
    }
    const appliedVersions = applied.filter((a) => a.version !== null).map((a) => a.version as string)
    const current = appliedVersions.reduce<string | null>((m, v) => (m === null || compareVersions(v, m) > 0 ? v : m), null)
    const pending = resolved.filter((r) => !appliedVersions.some((v) => compareVersions(v, r.version) === 0))
    const outOfOrder = pending.find((r) => current !== null && compareVersions(r.version, current) < 0)
    if (outOfOrder)
      throw new FlywayException(`Validate failed: Detected resolved migration not applied to database: ${outOfOrder.version}`)

    let rank = applied.reduce((m, a) => Math.max(m, a.installed_rank), 0)
    const insert = this.db.prepare(
      `INSERT INTO "${TABLE}" (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success) VALUES (?, ?, ?, ?, ?, ?, '', ?, 1)`,
    )
    for (const r of pending) {
      logger.info(() => `Migrating schema to version "${r.version} - ${r.description}"`)
      const start = Date.now()
      this.db.exec('BEGIN')
      try {
        r.run(this.db)
        insert.run(++rank, r.version, r.description, r.type, r.script, r.checksum, Date.now() - start)
        this.db.exec('COMMIT')
      } catch (e) {
        this.db.exec('ROLLBACK')
        throw new FlywayException(`Migration ${r.script} failed`, e)
      }
    }
    if (pending.length > 0) logger.info(() => `Successfully applied ${pending.length} migrations, now at version v${pending.at(-1)?.version}`)
    return pending.length
  }
}
