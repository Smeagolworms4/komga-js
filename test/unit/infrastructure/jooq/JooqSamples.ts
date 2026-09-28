// Support des tests à oracle de infrastructure/jooq, miroir de
// komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/JooqSamples.kt (branche unit-oracles).
import { LocalDateTime } from '@js-joda/core'
import { gunzipSync, gzipSync } from 'node:zlib'
import { ContentRestrictions } from '../../../../src/domain/model/ContentRestrictions.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { type QueryPart, RenderContext } from '../../../../src/port/jooq/core.js'
import type { DataType, SqlValue } from '../../../../src/port/jooq/types.js'
import { type OracleDb, exec } from '../../db.js'

/** Littéral SQL d'une valeur liée, comme `ParamType.INLINED` de jOOQ 3.19 (dialecte SQLite) */
function inlineLiteral(v: SqlValue): string {
  if (v === null) return 'null'
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  if (typeof v === 'string') return `'${v.replaceAll("'", "''")}'`
  return `X'${Buffer.from(v).toString('hex')}'`
}

/** Nombre à virgule en ligne comme jOOQ : notation scientifique de la plus courte écriture (float32 pour REAL), `2.5E0`, `1E-1` */
function inlineDecimal(v: number, float: boolean): string {
  let digits = String(v)
  if (float) {
    for (let p = 1; p <= 9; p++) {
      const t = Number(v.toPrecision(p))
      if (Math.fround(t) === v) {
        digits = String(t)
        break
      }
    }
  }
  const [m, e] = Number(digits).toExponential().split('e') as [string, string]
  return `${m}E${Number(e)}`
}

class InlinedRenderContext extends RenderContext {
  override bind(value: unknown, type: DataType<unknown>): this {
    const v = type.toSql(value)
    this.sql += typeof v === 'number' && (type.name === 'REAL' || type.name === 'DOUBLE') ? inlineDecimal(v, type.name === 'REAL') : inlineLiteral(v)
    return this
  }
}

/** Rendu d'une requête : SQL avec marqueurs, valeurs liées, SQL avec valeurs en ligne */
export function render(q: QueryPart): unknown[] {
  const ctx = new RenderContext().visit(q)
  return [ctx.sql, ctx.params.map((p) => p.value), new InlinedRenderContext().visit(q).sql]
}

/** Rendu sans le SQL en ligne (valeurs liées calculées à partir de la date du jour) */
export function renderBinds(q: QueryPart): unknown[] {
  const ctx = new RenderContext().visit(q)
  return [ctx.sql, ctx.params.map((p) => p.value)]
}

/** gzip des octets UTF-8 de `s` */
export function gzip(s: string): Uint8Array {
  return new Uint8Array(gzipSync(Buffer.from(s, 'utf8')))
}

/** Contenu d'octets gzip, en texte UTF-8 (les en-têtes gzip diffèrent entre la JVM et Node, pas le contenu) */
export function gunzip(b: Uint8Array | null): string | null {
  return b === null ? null : gunzipSync(b).toString('utf8')
}

export function user(id: string, sharedLibrariesIds: Set<string> | null = null, restrictions: ContentRestrictions = new ContentRestrictions()): KomgaUser {
  return new KomgaUser({
    email: `${id}@example.org`,
    password: 'p',
    sharedLibrariesIds: sharedLibrariesIds ?? new Set(),
    sharedAllLibraries: sharedLibrariesIds === null,
    restrictions,
    id,
    createdDate: LocalDateTime.of(2020, 1, 1, 0, 0),
  })
}

export function insert(db: OracleDb): unknown[][] {
  exec(db.dataSource.getConnection(), ...rows)
  return db.rawQuery('select (select count(*) from SERIES), (select count(*) from BOOK)')
}

const D = "'2020-01-01 00:00:00.0'"

/** Lignes d'exemple de la base principale (mêmes instructions côté Kotlin) */
export const rows = [

  `insert into "USER"(ID, EMAIL, PASSWORD) values ('U1', 'u1@example.org', 'p'), ('U2', 'u2@example.org', 'p')`,
  `insert into LIBRARY(ID, NAME, ROOT) values ('L1', 'Lib 1', 'file:/l1'), ('L2', 'Lib 2', 'file:/l2'), ('L3', 'Lib 3', 'file:/l3')`,
  `insert into SERIES(ID, FILE_LAST_MODIFIED, NAME, URL, LIBRARY_ID, BOOK_COUNT, DELETED_DATE, ONESHOT) values ` +
    `('S1', ${D}, 's1', 'file:/l1/s1', 'L1', 3, null, 0), ` +
    `('S2', ${D}, 's2', 'file:/l1/s2', 'L1', 2, null, 0), ` +
    `('S3', ${D}, 's3', 'file:/l2/s3', 'L2', 1, '2021-01-01 00:00:00.0', 0), ` +
    `('S4', ${D}, 's4', 'file:/l2/s4', 'L2', 1, null, 1), ` +
    `('S5', ${D}, 's5', 'file:/l1/s5', 'L1', 0, null, 0), ` +
    `('S6', ${D}, 's6', 'file:/l3/s6', 'L3', 2, null, 0)`,
  `insert into SERIES_METADATA(SERIES_ID, STATUS, TITLE, TITLE_SORT, PUBLISHER, AGE_RATING, LANGUAGE, TOTAL_BOOK_COUNT) values ` +
    `('S1', 'ONGOING', 'Élan Vital', 'elan vital', 'Dargaud', null, 'en', 3), ` +
    `('S2', 'ENDED', 'alpha', 'Alpha', 'dargaud', 12, 'EN', 5), ` +
    `('S3', 'HIATUS', 'Beta Ça', 'beta ça', 'Glénat', 16, 'fr', null), ` +
    `('S4', 'ABANDONED', 'ÉCOLE 100%_x', 'ecole', '', 18, '', 1), ` +
    `('S5', 'ONGOING', 'omega', 'Omega', 'Glenat', 10, 'fr-FR', 0)`,
  `insert into SERIES_METADATA_SHARING(LABEL, SERIES_ID) values ('kids', 'S1'), ('adult', 'S2'), ('kids', 'S3'), ('Adult', 'S3'), ('teen', 'S5')`,
  `insert into SERIES_METADATA_TAG(TAG, SERIES_ID) values ('action', 'S1'), ('Action', 'S2'), ('drama', 'S3'), ('Äction', 'S4')`,
  `insert into SERIES_METADATA_GENRE(GENRE, SERIES_ID) values ('Comedy', 'S1'), ('comedy', 'S3'), ('Horror', 'S2')`,
  `insert into BOOK_METADATA_AGGREGATION(SERIES_ID, RELEASE_DATE) values ('S1', '2020-05-01'), ('S2', '1999-12-31'), ('S3', null), ('S4', '2021-01-02'), ('S5', '2020-05-02')`,
  `insert into BOOK_METADATA_AGGREGATION_TAG(TAG, SERIES_ID) values ('booktag', 'S2'), ('action', 'S5')`,
  `insert into BOOK_METADATA_AGGREGATION_AUTHOR(NAME, ROLE, SERIES_ID) values ('Alice', 'writer', 'S1'), ('Bob', 'penciller', 'S1'), ('alice', 'Writer', 'S2'), ('Émile', 'writer', 'S3')`,
  `insert into READ_PROGRESS_SERIES(SERIES_ID, USER_ID, READ_COUNT, IN_PROGRESS_COUNT) values ('S1', 'U1', 3, 0), ('S2', 'U1', 1, 1), ('S3', 'U2', 1, 0), ('S5', 'U1', 0, 0)`,
  `insert into COLLECTION(ID, NAME, SERIES_COUNT) values ('C1', 'col', 2), ('C2', 'col2', 1)`,
  `insert into COLLECTION_SERIES(COLLECTION_ID, SERIES_ID, NUMBER) values ('C1', 'S2', 0), ('C1', 'S1', 1), ('C2', 'S3', 0)`,
  `insert into BOOK(ID, FILE_LAST_MODIFIED, NAME, URL, SERIES_ID, LIBRARY_ID, NUMBER, DELETED_DATE, ONESHOT) values ` +
    `('B1', ${D}, 'b1', 'file:/l1/s1/b1.cbz', 'S1', 'L1', 1, null, 0), ` +
    `('B2', ${D}, 'b2', 'file:/l1/s1/b2.cbz', 'S1', 'L1', 2, null, 0), ` +
    `('B3', ${D}, 'b3', 'file:/l1/s1/b3.cbz', 'S1', 'L1', 3, '2021-01-01 00:00:00.0', 0), ` +
    `('B4', ${D}, 'b4', 'file:/l1/s2/b4.epub', 'S2', 'L1', 1, null, 0), ` +
    `('B5', ${D}, 'b5', 'file:/l2/s3/b5.cbr', 'S3', 'L2', 1, null, 0), ` +
    `('B6', ${D}, 'b6', 'file:/l2/s4.pdf', 'S4', 'L2', 1, null, 1), ` +
    `('B7', ${D}, 'b7', 'file:/l3/s6/b7.cbz', 'S6', 'L3', 1, null, 0)`,
  `insert into BOOK_METADATA(BOOK_ID, NUMBER, NUMBER_SORT, RELEASE_DATE, TITLE) values ` +
    `('B1', '1', 1.0, '2020-01-01', 'Début'), ` +
    `('B2', '2', 2.5, '2020-06-15', 'deuxième'), ` +
    `('B3', '3', 3.0, null, 'TROIS'), ` +
    `('B4', '1', -1.0, '1999-12-31', 'alpha one'), ` +
    `('B5', '1', 1.0, '2021-01-01', 'Ça commence'), ` +
    `('B6', '1', 100.0, '2021-01-02', '100%_x')`,
  `insert into MEDIA(BOOK_ID, STATUS, MEDIA_TYPE) values ` +
    `('B1', 'READY', 'application/zip'), ('B2', 'UNKNOWN', null), ('B3', 'ERROR', 'application/pdf'), ` +
    `('B4', 'OUTDATED', 'application/epub+zip'), ('B5', 'READY', 'application/x-rar-compressed; version=4'), ` +
    `('B6', 'UNSUPPORTED', 'application/pdf'), ('B7', 'READY', 'application/x-7z-compressed')`,
  `insert into READ_PROGRESS(BOOK_ID, USER_ID, PAGE, COMPLETED) values ('B1', 'U1', 10, 1), ('B2', 'U1', 3, 0), ('B4', 'U2', 1, 1), ('B5', 'U1', 1, 1)`,
  `insert into BOOK_METADATA_TAG(TAG, BOOK_ID) values ('tag1', 'B1'), ('TAG1', 'B2'), ('tàg2', 'B4')`,
  `insert into BOOK_METADATA_AUTHOR(NAME, ROLE, BOOK_ID) values ('Alice', 'writer', 'B1'), ('alice', 'WRITER', 'B2'), ('Bob', 'penciller', 'B1'), ('Émile', 'colorist', 'B5')`,
  `insert into THUMBNAIL_BOOK(ID, BOOK_ID, TYPE, SELECTED) values ('T1', 'B1', 'GENERATED', 1), ('T2', 'B1', 'SIDECAR', 0), ('T3', 'B2', 'USER_UPLOADED', 1), ('T4', 'B4', 'generated', 0)`,
  `insert into READLIST(ID, NAME, BOOK_COUNT) values ('R1', 'rl', 2), ('R2', 'rl2', 1)`,
  `insert into READLIST_BOOK(READLIST_ID, BOOK_ID, NUMBER) values ('R1', 'B2', 0), ('R1', 'B1', 1), ('R2', 'B5', 0)`,
]
