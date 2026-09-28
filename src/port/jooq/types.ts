// Support de portage : types SQL de jOOQ (SQLDataType) et conversions vers/depuis SQLite,
// alignées sur jOOQ 3.19 + sqlite-jdbc (relevé sur les vraies bibliothèques, voir PORTING.md
// « Stockage SQLite » et test/port/jooq/types.test.ts). Ce fichier n'a pas de jumeau Kotlin.
import '@js-joda/timezone'
import { Instant, LocalDate, LocalDateTime, ZoneId } from '@js-joda/core'
import { DataAccessException } from './exceptions.js'

export type SqlValue = string | number | bigint | Uint8Array | null

export abstract class DataType<T> {
  constructor(
    readonly name: string,
    readonly nullable: boolean = true,
  ) {}

  /** Valeur Kotlin/TS -> valeur liée à SQLite */
  abstract toSql(v: T | null): SqlValue
  /** Valeur lue dans SQLite -> valeur Kotlin/TS */
  abstract fromSql(v: SqlValue): T | null

  abstract withNullable(nullable: boolean): DataType<T>

  /** `.nullable(false)` */
  nullableFn(nullable: boolean): DataType<T> {
    return this.withNullable(nullable)
  }
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, '0')
}

/** `java.sql.Timestamp.toString()` : `yyyy-mm-dd hh:mm:ss.f...` (nanos sans zéros finaux, au moins un chiffre). */
export function timestampToString(d: LocalDateTime): string {
  // Timestamp.valueOf(LocalDateTime) passe par l'heure locale : une heure dans un saut de l'heure d'été est décalée
  d = d.atZone(ZoneId.systemDefault()).toLocalDateTime()
  const nanos = d.nano()
  let frac: string
  if (nanos === 0) frac = '0'
  else frac = pad(nanos, 9).replace(/0+$/, '')
  return `${pad(d.year(), 4)}-${pad(d.monthValue(), 2)}-${pad(d.dayOfMonth(), 2)} ${pad(d.hour(), 2)}:${pad(d.minute(), 2)}:${pad(d.second(), 2)}.${frac}`
}

const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/

function epochMillisToLocal(ms: number | bigint): LocalDateTime {
  return LocalDateTime.ofInstant(Instant.ofEpochMilli(Number(ms)), ZoneId.systemDefault())
}

export function parseLocalDateTime(v: SqlValue): LocalDateTime | null {
  if (v === null) return null
  if (typeof v === 'number' || typeof v === 'bigint') return epochMillisToLocal(v)
  if (typeof v !== 'string') throw new DataAccessException('Error while reading field')
  const m = DATETIME_RE.exec(v)
  if (!m) throw new DataAccessException(`Error while reading field: cannot parse "${v}" as LocalDateTime`)
  // précision milliseconde (troncature), comme sqlite-jdbc
  const millis = m[7] ? Number(m[7].slice(0, 3).padEnd(3, '0')) : 0
  const ldt = LocalDateTime.of(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), millis * 1_000_000)
  // sqlite-jdbc lit le texte comme une heure locale (java.sql.Timestamp) : une heure dans un saut de l'heure d'été
  // (ex. 2021-03-28 02:30 à Paris) est décalée après le saut (03:30), comme ZonedDateTime.of
  return ldt.atZone(ZoneId.systemDefault()).toLocalDateTime()
}

export function parseLocalDate(v: SqlValue): LocalDate | null {
  if (v === null) return null
  if (typeof v === 'number' || typeof v === 'bigint') return epochMillisToLocal(v).toLocalDate()
  if (typeof v !== 'string') throw new DataAccessException('Error while reading field')
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (!m) throw new DataAccessException(`Error while reading field: cannot parse "${v}" as LocalDate`)
  return LocalDate.of(Number(m[1]), Number(m[2]), Number(m[3]))
}

function toNumber(v: SqlValue): number | null {
  if (v === null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string') {
    // sqlite-jdbc : getInt/getDouble sur du texte -> conversion SQLite (préfixe numérique, sinon 0)
    const m = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(v)
    return m ? Number(m[0]) : 0
  }
  return 0
}

class SimpleType<T> extends DataType<T> {
  constructor(
    name: string,
    nullable: boolean,
    private readonly to: (v: T) => SqlValue,
    private readonly from: (v: SqlValue) => T | null,
  ) {
    super(name, nullable)
  }
  toSql(v: T | null): SqlValue {
    return v === null || v === undefined ? null : this.to(v)
  }
  fromSql(v: SqlValue): T | null {
    return v === null || v === undefined ? null : this.from(v)
  }
  withNullable(nullable: boolean): DataType<T> {
    return new SimpleType(this.name, nullable, this.to, this.from)
  }
}

const identity = <T>(v: T): SqlValue => v as unknown as SqlValue

export const SQLDataType = {
  // valeur non-String liée (ex. java.net.URL dans batch().bind()) : Convert jOOQ -> toString()
  VARCHAR: new SimpleType<string>('VARCHAR', true, (v) => (typeof v === 'string' || (v as unknown) instanceof Uint8Array ? v : String(v)), (v) => (v instanceof Uint8Array ? Buffer.from(v).toString('utf8') : String(v))),
  CLOB: new SimpleType<string>('CLOB', true, identity, (v) => (v instanceof Uint8Array ? Buffer.from(v).toString('utf8') : String(v))),
  // sqlite-jdbc getBoolean = getInt() != 0 (le texte 'true' est lu comme false)
  BOOLEAN: new SimpleType<boolean>('BOOLEAN', true, (v) => (v ? 1 : 0), (v) => toNumber(v) !== 0),
  INTEGER: new SimpleType<number>('INTEGER', true, identity, (v) => Math.trunc(toNumber(v) as number)),
  BIGINT: new SimpleType<number>('BIGINT', true, identity, (v) => (typeof v === 'bigint' ? Number(v) : Math.trunc(toNumber(v) as number))),
  // Float Kotlin : élargi en double à l'écriture, relu en float32
  REAL: new SimpleType<number>('REAL', true, (v) => Math.fround(v), (v) => Math.fround(toNumber(v) as number)),
  DOUBLE: new SimpleType<number>('DOUBLE', true, identity, (v) => toNumber(v)),
  BLOB: new SimpleType<Uint8Array>('BLOB', true, (v) => v, (v) => (v instanceof Uint8Array ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : new Uint8Array(Buffer.from(String(v), 'utf8')))),
  LOCALDATETIME: new SimpleType<LocalDateTime>('LOCALDATETIME', true, (v) => timestampToString(v), (v) => parseLocalDateTime(v)),
  LOCALDATE: new SimpleType<LocalDate>('LOCALDATE', true, (v) => v.toString(), (v) => parseLocalDate(v)),
  /** Type inconnu (DSL.field(name) sans type) : valeurs brutes */
  OTHER: new SimpleType<unknown>('OTHER', true, (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : (v as SqlValue)), (v) => v),
}

export type SQLDataTypes = typeof SQLDataType

/** Type SQL déduit d'une valeur JS (équivalent de DSL.val(x) / types Java). */
export function inferType(v: unknown): DataType<unknown> {
  if (typeof v === 'string') return SQLDataType.VARCHAR as DataType<unknown>
  if (typeof v === 'boolean') return SQLDataType.BOOLEAN as DataType<unknown>
  if (typeof v === 'number') return (Number.isInteger(v) ? SQLDataType.INTEGER : SQLDataType.DOUBLE) as DataType<unknown>
  if (typeof v === 'bigint') return SQLDataType.BIGINT as DataType<unknown>
  if (v instanceof LocalDateTime) return SQLDataType.LOCALDATETIME as DataType<unknown>
  if (v instanceof LocalDate) return SQLDataType.LOCALDATE as DataType<unknown>
  if (v instanceof Uint8Array) return SQLDataType.BLOB as DataType<unknown>
  return SQLDataType.OTHER
}
