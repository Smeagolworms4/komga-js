// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/UtilsOracleTest.kt
import { AgeRestriction, AllowExclude } from '../../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../../src/domain/model/ContentRestrictions.js'
import { EpubTocEntry } from '../../../../src/domain/model/EpubTocEntry.js'
import { MediaExtensionEpub } from '../../../../src/domain/model/MediaExtension.js'
import { R2Locator } from '../../../../src/domain/model/R2Locator.js'
import { UnpagedSorted } from '../../../../src/infrastructure/jooq/UnpagedSorted.js'
import {
  buildPage,
  csAlias,
  deserializeJsonGz,
  deserializeMediaExtension,
  inOrNoCondition,
  noCase,
  rlbAlias,
  serializeJsonGz,
  sortByValues,
  toCondition,
  toOrderBy,
  toSortField,
  udfStripAccents,
  unicode1,
  unicode3,
} from '../../../../src/infrastructure/jooq/Utils.js'
import type { Condition, Field, OrderField, SortField } from '../../../../src/port/jooq/core.js'
import { DSL } from '../../../../src/port/jooq/dsl.js'
import { Tables } from '../../../../src/port/jooq/generated/main/Tables.js'
import { SQLDataType } from '../../../../src/port/jooq/types.js'
import { Order, type Page, PageRequest, Pageable, Sort } from '../../../../src/port/spring-data.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'
import { gunzip, gzip, insert, render } from './JooqSamples.js'

const { func, kase } = oracle('infrastructure/jooq/Utils')

const db = new OracleDb()
const s = Tables.SERIES
const sm = Tables.SERIES_METADATA
const mapper = db.mapper

const series = (c: Condition) => db.dsl.select(s.ID).from(s).leftJoin(sm).on(s.ID.eq(sm.SERIES_ID)).where(c).orderBy(s.ID)

const seriesIds = (c: Condition) => series(c).fetch(s.ID)

const titles = (...order: OrderField[]) => db.dsl.select(sm.TITLE).from(sm).orderBy(...order)

const ordered = (order: SortField<unknown>[]) => db.dsl.select(sm.SERIES_ID).from(sm).orderBy(order)

const sorts = new Map<string, Field<unknown>>([
  ['title', sm.TITLE],
  ['age', sm.AGE_RATING],
  ['id', sm.SERIES_ID],
] as [string, Field<unknown>][])

const page = (p: Page<unknown>) => [p, p.totalPages, p.sort.toString(), p.pageable.isPaged, p.hasNext()]

const listOfNotNull = <T>(...v: (T | null)[]): T[] => v.filter((it): it is T => it !== null)

const locator = new R2Locator({
  href: 'chapter1.xhtml',
  type: 'application/xhtml+xml',
  title: 'Chapitre ü',
  locations: new R2Locator.Location({ fragments: ['p1'], progression: Math.fround(0.5), position: 3, totalProgression: Math.fround(0.1) }),
  text: new R2Locator.Text({ before: 'a', highlight: 'b' }),
})

func('noCase', () => {
  kase('sample rows', () => insert(db))
  kase('render', () => render(titles(noCase(sm.TITLE), sm.SERIES_ID.asc())))
  kase('order', () => titles(noCase(sm.TITLE), sm.SERIES_ID.asc()).fetch(sm.TITLE))
  kase('order desc', () => titles(noCase(sm.TITLE).desc(), sm.SERIES_ID.asc()).fetch(sm.TITLE))
  kase('equal ignores ascii case', () => seriesIds(noCase(sm.TITLE).eq('ALPHA')))
  kase('equal keeps accents and non-ascii case', () => seriesIds(noCase(sm.TITLE).eq('élan vital')))
  kase('render equal', () => render(series(noCase(sm.PUBLISHER).eq('DARGAUD'))))
  kase('publisher', () => seriesIds(noCase(sm.PUBLISHER).eq('DARGAUD')))
})

func('unicode1', () => {
  kase('render', () => render(titles(unicode1(sm.TITLE), sm.SERIES_ID.asc())))
  kase('order', () => titles(unicode1(sm.TITLE), sm.SERIES_ID.asc()).fetch(sm.TITLE))
  kase('equal ignores case and accents', () => seriesIds(unicode1(sm.TITLE).eq('elan VITAL')))
  kase('equal with cedilla', () => seriesIds(unicode1(sm.TITLE).eq('beta ca')))
  kase('equal with ligature and symbols', () => seriesIds(unicode1(sm.TITLE).eq('ecole 100%_X')))
  kase('not equal', () => seriesIds(unicode1(sm.PUBLISHER).ne('glenat')))
  kase('render not equal', () => render(series(unicode1(sm.PUBLISHER).ne('glenat'))))
  kase('like does not use the collation', () => seriesIds(unicode1(sm.TITLE).like('e%')))
})

func('unicode3', () => {
  kase('render', () => render(titles(unicode3(sm.TITLE), sm.SERIES_ID.asc())))
  kase('order', () => titles(unicode3(sm.TITLE), sm.SERIES_ID.asc()).fetch(sm.TITLE))
  kase('order desc', () => titles(unicode3(sm.TITLE).desc()).fetch(sm.TITLE))
  kase('equal is case sensitive', () => seriesIds(unicode3(sm.TITLE).eq('Alpha')))
  kase('equal same case', () => seriesIds(unicode3(sm.TITLE).eq('alpha')))
  kase('equal is accent sensitive', () => seriesIds(unicode3(sm.PUBLISHER).eq('Glenat')))
})

func('udfStripAccents', () => {
  kase('render', () => render(db.dsl.select(udfStripAccents(sm.TITLE)).from(sm).orderBy(sm.SERIES_ID)))
  kase('values', () => db.dsl.select(udfStripAccents(sm.TITLE)).from(sm).orderBy(sm.SERIES_ID).fetch().map((it) => it.value1()))
  kase('bound value', () => db.dsl.select(udfStripAccents(DSL.value('Ça été Æsop Øre ñ ß ﬁ Ǆ'))).fetchOne()?.value1())
  kase('empty string', () => db.dsl.select(udfStripAccents(DSL.value(''))).fetchOne()?.value1())
  kase('null value', () => db.dsl.select(udfStripAccents(DSL.value<string>(null as unknown as string, SQLDataType.VARCHAR))).fetchOne()?.value1())
  kase('render bound value', () => render(db.dsl.select(udfStripAccents(DSL.value('é')))))
  kase('in condition', () => seriesIds(udfStripAccents(sm.TITLE).eq('Elan Vital')))
  kase('publisher without accents', () => seriesIds(udfStripAccents(sm.PUBLISHER).eq('Glenat')))
})

func('toOrderBy', () => {
  kase('single property', () => render(ordered(toOrderBy(Sort.by('title'), sorts))))
  kase('single property ids', () => ordered(toOrderBy(Sort.by('title'), sorts)).fetch(sm.SERIES_ID))
  kase('several orders', () => render(ordered(toOrderBy(Sort.by(Order.desc('age'), Order.asc('id')), sorts))))
  kase('several orders ids', () => ordered(toOrderBy(Sort.by(Order.desc('age'), Order.asc('id')), sorts)).fetch(sm.SERIES_ID))
  kase('unknown properties are dropped', () => toOrderBy(Sort.by('nope', 'title', 'Title', ''), sorts).length)
  kase('unknown properties render', () => render(ordered(toOrderBy(Sort.by('nope', 'age'), sorts))))
  kase('unsorted', () => toOrderBy(Sort.unsorted(), sorts).length)
  kase('empty map', () => toOrderBy(Sort.by('title'), new Map()).length)
  kase('ignore case and null handling are not rendered', () =>
    render(ordered(toOrderBy(Sort.by(Order.asc('title').ignoreCaseOrder(), Order.desc('age').nullsLast()), sorts))),
  )
})

func('toSortField', () => {
  kase('ascending', () => render(ordered(listOfNotNull(toSortField(Order.asc('age'), sorts)))))
  kase('descending', () => render(ordered(listOfNotNull(toSortField(Order.desc('age'), sorts)))))
  kase('descending ids', () => ordered(listOfNotNull(toSortField(Order.desc('age'), sorts), toSortField(Order.asc('id'), sorts))).fetch(sm.SERIES_ID))
  kase('default direction', () => render(ordered(listOfNotNull(toSortField(Order.by('title'), sorts)))))
  kase('missing property', () => toSortField(Order.asc('missing'), sorts))
  kase('property is case sensitive', () => toSortField(Order.asc('TITLE'), sorts))
})

func('sortByValues', () => {
  kase('render', () => render(db.dsl.select(s.ID).from(s).orderBy(sortByValues(s.ID, ['S3', 'S1']), s.ID)))
  kase('ascending', () => db.dsl.select(s.ID).from(s).orderBy(sortByValues(s.ID, ['S3', 'S1', 'S5']), s.ID).fetch(s.ID))
  kase('descending render', () => render(db.dsl.select(s.ID).from(s).orderBy(sortByValues(s.ID, ['S3', 'S1'], { asc: false }), s.ID)))
  kase('descending', () => db.dsl.select(s.ID).from(s).orderBy(sortByValues(s.ID, ['S3', 'S1', 'S5'], { asc: false }), s.ID).fetch(s.ID))
  kase('empty values', () => render(db.dsl.select(s.ID).from(s).orderBy(sortByValues(s.ID, []), s.ID)))
  kase('empty values ids', () => db.dsl.select(s.ID).from(s).orderBy(sortByValues(s.ID, []), s.ID.desc()).fetch(s.ID))
  kase('duplicate values', () => db.dsl.select(s.ID).from(s).orderBy(sortByValues(s.ID, ['S2', 'S4', 'S2']), s.ID).fetch(s.ID))
  kase('dummy value', () => db.dsl.select(s.ID).from(s).orderBy(sortByValues(s.ID, ['dummy dsl', 'S6']), s.ID).fetch(s.ID))
  kase('selected value', () =>
    db.dsl
      .select(s.ID, sortByValues(s.ID, ['S2', 'S1'], { asc: false }))
      .from(s)
      .orderBy(s.ID)
      .fetch()
      .map((it) => [it.value1(), it.value2()]),
  )
})

func('inOrNoCondition', () => {
  kase('null list', () => render(series(inOrNoCondition(s.ID, null))))
  kase('null list ids', () => seriesIds(inOrNoCondition(s.ID, null)))
  kase('empty list', () => render(series(inOrNoCondition(s.ID, []))))
  kase('empty list ids', () => seriesIds(inOrNoCondition(s.ID, [])))
  kase('one value', () => render(series(inOrNoCondition(s.ID, ['S2']))))
  kase('several values', () => render(series(inOrNoCondition(s.ID, new Set(['S5', 'S1', 'nope'])))))
  kase('several values ids', () => seriesIds(inOrNoCondition(s.ID, new Set(['S5', 'S1', 'nope']))))
  kase('duplicates', () => render(series(inOrNoCondition(s.ID, ['S1', 'S1']))))
  kase('combined with and', () => render(series(s.LIBRARY_ID.eq('L1').and(inOrNoCondition(s.ID, null)))))
  kase('combined with or', () => seriesIds(s.LIBRARY_ID.eq('L3').or(inOrNoCondition(s.ID, []))))
})

func('toCondition', () => {
  const restrictions: [string, ContentRestrictions][] = [
    ['none', new ContentRestrictions()],
    ['allow only 12', new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 12, restriction: AllowExclude.ALLOW_ONLY }) })],
    ['allow only 0', new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 0, restriction: AllowExclude.ALLOW_ONLY }) })],
    ['exclude 16', new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 16, restriction: AllowExclude.EXCLUDE }) })],
    ['labels allow', new ContentRestrictions({ labelsAllow: new Set(['kids']) })],
    ['labels allow case', new ContentRestrictions({ labelsAllow: new Set(['ADULT', ' ']) })],
    ['labels exclude', new ContentRestrictions({ labelsExclude: new Set(['adult']) })],
    ['labels allow and exclude', new ContentRestrictions({ labelsAllow: new Set(['kids', 'teen']), labelsExclude: new Set(['teen', 'adult']) })],
    ['age and labels allow', new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 12, restriction: AllowExclude.ALLOW_ONLY }), labelsAllow: new Set(['kids']) })],
    [
      'age exclude and labels exclude',
      new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 16, restriction: AllowExclude.EXCLUDE }), labelsExclude: new Set(['kids']) }),
    ],
    [
      'everything',
      new ContentRestrictions({
        ageRestriction: new AgeRestriction({ age: 18, restriction: AllowExclude.ALLOW_ONLY }),
        labelsAllow: new Set(['kids', 'adult']),
        labelsExclude: new Set(['teen']),
      }),
    ],
  ]
  for (const [name, r] of restrictions) {
    kase(name, () => render(series(toCondition(r))))
    kase(`${name} ids`, () => seriesIds(toCondition(r)))
  }
})

func('serializeJsonGz', () => {
  kase('map', () =>
    gunzip(
      serializeJsonGz(
        mapper,
        new Map<string, unknown>([
          ['a', 1],
          ['b', ['x', null]],
          ['c', 'é"\n'],
        ]),
      ),
    ),
  )
  kase('list', () => gunzip(serializeJsonGz(mapper, [1, 2.5, true, 's'])))
  kase('string', () => gunzip(serializeJsonGz(mapper, 'Ça')))
  kase('number', () => gunzip(serializeJsonGz(mapper, 42)))
  kase('locator', () => gunzip(serializeJsonGz(mapper, locator)))
  kase('locator without optional fields', () => gunzip(serializeJsonGz(mapper, new R2Locator({ href: 'h', type: 't', locations: new R2Locator.Location() }))))
  kase('epub extension', () =>
    gunzip(
      serializeJsonGz(
        mapper,
        new MediaExtensionEpub({
          toc: [new EpubTocEntry({ title: 'Chapter 1', href: 'c1.xhtml', children: [new EpubTocEntry({ title: 'Section', href: null })] })],
          isFixedLayout: true,
          positions: [locator],
        }),
      ),
    ),
  )
  kase('gzip magic', () => serializeJsonGz(mapper, 'x')?.slice(0, 3))
})

func('deserializeJsonGz', () => {
  const L = { class: R2Locator }
  kase('null', () => deserializeJsonGz<R2Locator>(mapper, null, L))
  kase('not gzip', () => deserializeJsonGz<R2Locator>(mapper, new TextEncoder().encode('{}'), L))
  kase('empty bytes', () => deserializeJsonGz<R2Locator>(mapper, new Uint8Array(0), L))
  kase('locator', () => deserializeJsonGz<R2Locator>(mapper, gzip('{"href":"a","type":"b","locations":{"progression":0.25,"position":2}}'), L))
  kase('round trip', () => deserializeJsonGz<R2Locator>(mapper, serializeJsonGz(mapper, locator), L))
  kase('unknown property', () => deserializeJsonGz<R2Locator>(mapper, gzip('{"href":"a","type":"b","other":1}'), L))
  kase('case insensitive property', () => deserializeJsonGz<R2Locator>(mapper, gzip('{"HREF":"a","Type":"b"}'), L))
  kase('missing required property', () => deserializeJsonGz<R2Locator>(mapper, gzip('{"href":"a"}'), L))
  kase('null required property', () => deserializeJsonGz<R2Locator>(mapper, gzip('{"href":null,"type":"b"}'), L))
  kase('invalid json', () => deserializeJsonGz<R2Locator>(mapper, gzip('{"href":'), L))
  kase('empty content', () => deserializeJsonGz<R2Locator>(mapper, gzip(''), L))
  kase('truncated gzip', () => deserializeJsonGz<R2Locator>(mapper, gzip('{"href":"a","type":"b"}').slice(0, 12), L))
  kase('json null', () => deserializeJsonGz<R2Locator>(mapper, gzip('null'), L))
  kase('string target', () => deserializeJsonGz<string>(mapper, gzip('"é"'), 'String'))
})

func('deserializeMediaExtension', () => {
  const epub = 'org.gotson.komga.domain.model.MediaExtensionEpub'
  kase('null class', () => deserializeMediaExtension(mapper, null, gzip('{}')))
  kase('null blob', () => deserializeMediaExtension(mapper, epub, null))
  kase('both null', () => deserializeMediaExtension(mapper, null, null))
  kase('empty epub', () => deserializeMediaExtension(mapper, epub, gzip('{}')))
  kase('epub', () =>
    deserializeMediaExtension(
      mapper,
      epub,
      gzip('{"toc":[{"title":"T","href":"t.xhtml","children":[]}],"landmarks":[],"pageList":[],"isFixedLayout":true,"positions":[{"href":"p","type":"x"}]}'),
    ),
  )
  kase('round trip', () =>
    deserializeMediaExtension(
      mapper,
      epub,
      serializeJsonGz(mapper, new MediaExtensionEpub({ pageList: [new EpubTocEntry({ title: 'p1', href: 'p1.xhtml' })], positions: [locator] })),
    ),
  )
  kase('unknown class', () => deserializeMediaExtension(mapper, 'org.gotson.komga.domain.model.Nope', gzip('{}')))
  kase('not a media extension', () => deserializeMediaExtension(mapper, 'org.gotson.komga.domain.model.R2Locator', gzip('{"href":"a","type":"b"}')))
  kase('interface', () => deserializeMediaExtension(mapper, 'org.gotson.komga.domain.model.MediaExtension', gzip('{}')))
  kase('not gzip', () => deserializeMediaExtension(mapper, epub, new TextEncoder().encode('{}')))
  kase('invalid json', () => deserializeMediaExtension(mapper, epub, gzip('[')))
  kase('wrong type', () => deserializeMediaExtension(mapper, epub, gzip('{"isFixedLayout":"maybe"}')))
})

func('rlbAlias', () => {
  kase('render', () =>
    render(db.dsl.select(rlbAlias('R1').BOOK_ID).from(rlbAlias('R1')).where(rlbAlias('R1').READLIST_ID.eq('R1')).orderBy(rlbAlias('R1').NUMBER)),
  )
  kase('values', () =>
    db.dsl
      .select(rlbAlias('R1').BOOK_ID)
      .from(rlbAlias('R1'))
      .where(rlbAlias('R1').READLIST_ID.eq('R1'))
      .orderBy(rlbAlias('R1').NUMBER)
      .fetch()
      .map((it) => it.value1()),
  )
  kase('name', () => rlbAlias('R1').getName())
  kase('name with special characters', () => render(db.dsl.select(rlbAlias('a"b c').READLIST_ID).from(rlbAlias('a"b c'))))
  kase('empty id', () => rlbAlias('').getName())
})

func('csAlias', () => {
  kase('render', () =>
    render(db.dsl.select(csAlias('C1').SERIES_ID).from(csAlias('C1')).where(csAlias('C1').COLLECTION_ID.eq('C1')).orderBy(csAlias('C1').NUMBER)),
  )
  kase('values', () =>
    db.dsl
      .select(csAlias('C1').SERIES_ID)
      .from(csAlias('C1'))
      .where(csAlias('C1').COLLECTION_ID.eq('C1'))
      .orderBy(csAlias('C1').NUMBER)
      .fetch()
      .map((it) => it.value1()),
  )
  kase('name', () => csAlias('C1').getName())
  kase('join', () =>
    render(db.dsl.select(s.ID).from(s).leftJoin(csAlias('C2')).on(s.ID.eq(csAlias('C2').SERIES_ID)).where(csAlias('C2').COLLECTION_ID.eq('C2'))),
  )
})

func('buildPage', () => {
  kase('paged, sort from pageable', () => page(buildPage(['a', 'b'], PageRequest.of(1, 2, Sort.by('title')), 10, null)))
  kase('paged, explicit sort', () => page(buildPage(['a'], PageRequest.of(0, 5, Sort.by('title')), 1, Sort.by(Order.desc('age')))))
  kase('paged, count smaller than page', () => page(buildPage(['a', 'b', 'c'], PageRequest.of(2, 10), 5, null)))
  kase('paged, empty content', () => page(buildPage([], PageRequest.of(3, 10), 5, null)))
  kase('unpaged, small count', () => page(buildPage(['a'], Pageable.unpaged(), 5, null)))
  kase('unpaged, large count', () =>
    page(
      buildPage(
        Array.from({ length: 30 }, (_, i) => `x${i}`),
        Pageable.unpaged(),
        30,
        Sort.by('id'),
      ),
    ),
  )
  kase('unpaged, count 20', () => page(buildPage([], Pageable.unpaged(), 20, null)))
  kase('unpaged, zero count', () => page(buildPage([], Pageable.unpaged(), 0, null)))
  kase('unpaged sorted', () => page(buildPage([1, 2, 3], new UnpagedSorted(Sort.by(Order.asc('seriesId'), Order.desc('number'))), 3, null)))
  kase('unpaged sorted, explicit sort', () => page(buildPage([1], new UnpagedSorted(Sort.by('a')), 1, Sort.unsorted())))
  kase('unpaged sorted, large count', () => page(buildPage([1], new UnpagedSorted(Sort.unsorted()), 25, null)))
})
