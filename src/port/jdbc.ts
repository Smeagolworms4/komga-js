// Support de portage : sous-ensemble de Spring JdbcTemplate utilisé par les migrations Kotlin.
// Ce fichier n'a pas de jumeau Kotlin.
import type Database from 'better-sqlite3'

/** Ligne de `queryForList` : Spring renvoie une LinkedCaseInsensitiveMap (clés insensibles à la casse). */
export class RowMap {
  private readonly values = new Map<string, unknown>()

  constructor(row: Record<string, unknown>) {
    for (const [k, v] of Object.entries(row)) this.values.set(k.toUpperCase(), v)
  }

  get(key: string): unknown {
    return this.values.get(key.toUpperCase()) ?? null
  }
}

export class JdbcTemplate {
  constructor(private readonly db: Database.Database) {}

  queryForList(sql: string, ...args: unknown[]): RowMap[] {
    return (this.db.prepare(sql).all(...toSqlite(args)) as Record<string, unknown>[]).map((r) => new RowMap(r))
  }

  batchUpdate(sql: string, batchArgs: unknown[][]): number[] {
    const stmt = this.db.prepare(sql)
    return batchArgs.map((args) => stmt.run(...toSqlite(args)).changes)
  }

  update(sql: string, ...args: unknown[]): number {
    return this.db.prepare(sql).run(...toSqlite(args)).changes
  }
}

/** Conversion des paramètres JDBC vers better-sqlite3 (booléens en 0/1, comme sqlite-jdbc). */
export function toSqlite(args: unknown[]): unknown[] {
  return args.map((a) => (typeof a === 'boolean' ? (a ? 1 : 0) : a === undefined ? null : a))
}
