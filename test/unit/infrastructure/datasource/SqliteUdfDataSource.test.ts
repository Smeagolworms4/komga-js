// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/datasource/SqliteUdfDataSourceOracleTest.kt
import type Database from 'better-sqlite3'
import { afterAll } from 'vitest'
import { SqliteUdfDataSource } from '../../../../src/infrastructure/datasource/SqliteUdfDataSource.js'
import { exec, query } from '../../db.js'
import { exceptionType, oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/datasource/SqliteUdfDataSource')

const opened: Database.Database[] = []
afterAll(() => {
  for (const c of opened) c.close()
})

function newConnection(): Database.Database {
  const ds = new SqliteUdfDataSource()
  ds.setUrl('jdbc:sqlite::memory:')
  const c = ds.openConnection()
  opened.push(c)
  return c
}

let conn: Database.Database | null = null
const connection = () => (conn ??= newConnection())

const q = (sql: string) => query(connection(), sql)

const one = (sql: string) => (q(sql)[0] as unknown[])[0]

/** l'instruction échoue-t-elle (les messages d'erreur SQL ne sont pas comparés) */
const fails = async (sql: string) => (await exceptionType(() => q(sql))) !== null

const sqlString = (s: string) => `'${s.replaceAll("'", "''")}'`

/** chaînes triées par une collation, ex aequo dans l'ordre d'insertion */
function sorted(collation: string, values: string[], desc = false): unknown[] {
  const rows = values.map((v, i) => `select ${sqlString(v)} as v, ${i} as i`).join(' union all ')
  return q(`select v from (${rows}) order by v collate ${collation} ${desc ? 'desc' : 'asc'}, i`).map((it) => it[0])
}

const regexp = (text: string | null, pattern: string | null) =>
  one(`select ${text === null ? 'null' : sqlString(text)} regexp ${pattern === null ? 'null' : sqlString(pattern)}`)

const words = [
'b', 'a', 'B', 'A', 'á', 'Á', 'à', 'ä', 'æ', 'ae', 'Æ', 'z', 'Z', 'ž', 'é', 'e', 'É', 'E', 'ê', 'ë',
  '', ' ', '1', '10', '2', '_', '-', '!', 'a b', 'ab', 'ß', 'ss', 'SS', 'ø', 'o', 'œ', 'oe', 'ı', 'i', 'I', 'İ',
  '漫画', 'まんが', 'マンガ', '한국어', 'Ω', 'ω', 'ǅ', 'ǆ', 'Ǆ', 'ﬁ', 'fi', 'Ⅻ', 'xii', '①', '½',
]

func('getConnection@22', () => {
  kase('udf and collations available', () => [
    one("select UDF_STRIP_ACCENTS('Éé')"),
    one("select 'ABC' regexp 'b'"),
    one("select 'a' = 'A' collate COLLATION_UNICODE_1"),
    one("select 'a' = 'A' collate COLLATION_UNICODE_3"),
  ])
  kase('new connection each time', () => {
    const c1 = newConnection()
    const c2 = newConnection()
    exec(c1, 'create table T (A varchar)')
    return [query(c1, 'select count(*) from sqlite_master'), query(c2, 'select count(*) from sqlite_master')]
  })
  kase('foreign keys not enforced by default', () => q('pragma foreign_keys'))
})

func('getConnection@24', () => {
  // PORT: getConnection(username, password) -> openConnection()
  kase('udf available', () => query(newConnection(), "select UDF_STRIP_ACCENTS('Ç'), 'x' regexp 'X', 'é' < 'f' collate COLLATION_UNICODE_3"))
})

func('addAllUdf', () => {
  kase('functions', () => q("select name, narg from pragma_function_list where name in ('regexp', 'udf_strip_accents') order by name"))
  kase('collations', () => q("select name from pragma_collation_list where name like 'COLLATION_UNICODE_%' order by name"))
})

func('createUdfRegexp', () => {
  kase('matches anywhere', () => regexp('xxABCxx', 'abc'))
  kase('no match', () => regexp('xyz', 'abc'))
  kase('anchored', () => [regexp('Alpha', '^a'), regexp('beta', '^a'), regexp('Alpha', 'A$')])
  kase('null pattern matches', () => regexp('abc', null))
  kase('null text', () => [regexp(null, '^$'), regexp(null, 'a')])
  kase('both null', () => regexp(null, null))
  kase('empty pattern', () => regexp('', ''))
  kase('character classes', () => [regexp('Z', '[a-z]'), regexp('5', '\\d'), regexp('a', '\\D'), regexp(' ', '\\s'), regexp('_', '\\w')])
  kase('letter group', () => [regexp('Élan', '^[a-e]'), regexp('élan', '^[^a-z]'), regexp('123', '^[^a-z]'), regexp('#1', '^[0-9#]')])
  kase('non-ascii case', () => [regexp('élan', '^É'), regexp('ÉLAN', 'élan'), regexp('straße', 'STRASSE'), regexp('Ω', 'ω')])
  kase('dot and newline', () => [regexp('a\nb', 'a.b'), regexp('a\nb', '^b')])
  kase('alternation and groups', () => [regexp('the cat', '(dog|cat)$'), regexp('abab', '^(ab){2}$'), regexp('abab', '^(?:ab)+$')])
  kase('quantifiers', () => [regexp('aaa', '^a{2,3}$'), regexp('aaaa', '^a{2,3}$'), regexp('ab', '^a*?b')])
  kase('escapes', () => [regexp('a.b', 'a\\.b'), regexp('axb', 'a\\.b'), regexp('1+1', '1\\+1'), regexp('a\\b', '\\\\')])
  kase('unicode letters', () => [regexp('é', '^\\w$'), regexp('漫', '.'), regexp('😀', '^.$')])
  kase('lookaround', () => [regexp('foobar', 'foo(?=bar)'), regexp('foobaz', 'foo(?!bar)'), regexp('xbar', '(?<=x)bar')])
  kase('backreference', () => [regexp('abcabc', '(abc)\\1'), regexp('abcabd', '^(abc)\\1$')])
  kase('word boundary', () => [regexp('a cat', '\\bcat\\b'), regexp('concat', '\\bcat\\b')])
  kase('numeric values', () => [one("select 12 regexp '^1'"), one("select 1.5 regexp '\\.5$'"), one("select 'x' regexp 1")])
  kase('invalid pattern', () => fails("select 'a' regexp '('"))
  kase('in where clause', () => q("select v from (select 'Alpha' v union all select 'beta' union all select 'Gamma') where v regexp '^[a-c]' order by v"))
})

func('xFunc@42', () => {
  kase('returns 1 or 0', () => q("select 'a' regexp 'a', 'a' regexp 'b', typeof('a' regexp 'a')"))
  kase('negated', () => one("select 'a' not regexp 'b'"))
})

func('createUdfStripAccents', () => {
  kase('accents', () => one("select UDF_STRIP_ACCENTS('àáâãäåçèéêëìíîïñòóôõöùúûüýÿ ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ')"))
  kase('ligatures and special letters', () => one("select UDF_STRIP_ACCENTS('æ Æ œ Œ ß ø Ø đ Đ ł Ł ı ﬁ ǅ')"))
  kase('combining characters', () => one("select UDF_STRIP_ACCENTS('e' || char(769) || 'a' || char(776))"))
  kase('other scripts', () => one("select UDF_STRIP_ACCENTS('Ελληνικά Ά ё й 漫画 まんが ガ Tiếng Việt')"))
  kase('empty', () => one("select UDF_STRIP_ACCENTS('')"))
  kase('number', () => one('select UDF_STRIP_ACCENTS(12)'))
  kase('null fails', () => fails('select UDF_STRIP_ACCENTS(null)'))
  kase('in where clause', () => q("select v from (select 'Élan' v union all select 'elan' union all select 'ELAN') where UDF_STRIP_ACCENTS(v) = 'Elan'"))
})

func('xFunc@58', () => {
  kase('type', () => q("select typeof(UDF_STRIP_ACCENTS('a')), length(UDF_STRIP_ACCENTS('é'))"))
})

func('createUnicodeCollation', () => {
  kase('unicode 3 order', () => sorted(SqliteUdfDataSource.COLLATION_UNICODE_3, words))
  kase('unicode 1 order', () => sorted(SqliteUdfDataSource.COLLATION_UNICODE_1, words))
  kase('unicode 3 order desc', () => sorted(SqliteUdfDataSource.COLLATION_UNICODE_3, words, true))
  kase('binary order', () => sorted('BINARY', words))
  kase('nocase order', () => sorted('NOCASE', words))
})

func('xCompare@77', () => {
  const pairs: [string, string][] = [
    ['a', 'A'],
    ['a', 'á'],
    ['e', 'É'],
    ['ae', 'æ'],
    ['ss', 'ß'],
    ['i', 'ı'],
    ['a', 'a '],
    ['', ' '],
    ['1', '①'],
    ['fi', 'ﬁ'],
    ['ǅ', 'Ǆ'],
    ['マンガ', 'まんが'],
    ['a', 'b'],
  ]
  kase('unicode 1 equality', () => pairs.map(([x, y]) => one(`select ${sqlString(x)} = ${sqlString(y)} collate COLLATION_UNICODE_1`)))
  kase('unicode 3 equality', () => pairs.map(([x, y]) => one(`select ${sqlString(x)} = ${sqlString(y)} collate COLLATION_UNICODE_3`)))
  kase('unicode 3 less than', () => pairs.map(([x, y]) => one(`select ${sqlString(x)} < ${sqlString(y)} collate COLLATION_UNICODE_3`)))
  kase('unicode 1 distinct', () =>
    q("select count(distinct v collate COLLATION_UNICODE_1) from (select 'a' v union all select 'A' union all select 'à' union all select 'b')"),
  )
  kase('unicode 1 group by', () =>
    q("select min(v), count(*) from (select 'a' v union all select 'A' union all select 'à' union all select 'b') group by v collate COLLATION_UNICODE_1 order by 1"),
  )
})
