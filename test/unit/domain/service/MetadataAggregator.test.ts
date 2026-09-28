// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/MetadataAggregatorOracleTest.kt
import { LocalDate } from '@js-joda/core'
import { Author } from '../../../../src/domain/model/Author.js'
import { BookMetadata } from '../../../../src/domain/model/BookMetadata.js'
import { MetadataAggregator } from '../../../../src/domain/service/MetadataAggregator.js'
import { oracle, stable } from '../../oracle.js'
import { date } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/MetadataAggregator')

const aggregator = new MetadataAggregator()

const m = (
  number: string,
  numberSort: number,
  { summary = '', releaseDate = null as LocalDate | null, authors = [] as Author[], tags = new Set<string>() } = {},
) => new BookMetadata({ title: `t${number}`, summary, number, numberSort: Math.fround(numberSort), releaseDate, authors, tags, bookId: `B${number}`, createdDate: date })
const agg = (l: BookMetadata[]) => stable(aggregator.aggregate(l))
const a = (name: string, role: string) => new Author({ name, role })

func('aggregate', () => {
  kase('empty', () => agg([]))
  kase('single without data', () => agg([m('1', 1)]))
  kase('authors distinct by role and name', () =>
    agg([
      m('1', 1, { authors: [a('John', 'writer'), a('Jane', 'penciller')] }),
      m('2', 2, { authors: [a('john', 'writer'), a('John', 'Writer'), a('John', 'penciller')] }),
      m('3', 3, { authors: [a(' Jane ', 'PENCILLER'), a('Zed', 'colorist')] }),
    ]),
  )
  kase('tags union in order', () => agg([m('1', 1, { tags: new Set(['b', 'a']) }), m('2', 2, { tags: new Set(['a', 'c', 'B']) })]))
  kase('summary of lowest numberSort', () => agg([m('3', 3, { summary: 'third' }), m('1', 1, { summary: 'first' }), m('2', 2, { summary: 'second' })]))
  kase('summary skips blank', () => agg([m('1', 1, { summary: '  ' }), m('2', 2, { summary: '\t\n' }), m('3', 3, { summary: 'real' })]))
  kase('summary all blank', () => agg([m('1', 1, { summary: ' ' }), m('2', 2)]))
  kase('summary same numberSort keeps input order', () => agg([m('b', 1, { summary: 'B' }), m('a', 1, { summary: 'A' })]))
  kase('negative and fractional numberSort', () => agg([m('1.5', 1.5, { summary: 'one and half' }), m('-1', -1, { summary: 'minus one' }), m('0', 0)]))
  kase('release date minimum', () =>
    agg([
      m('1', 1, { releaseDate: LocalDate.of(2020, 5, 1) }),
      m('2', 2),
      m('3', 3, { releaseDate: LocalDate.of(1999, 12, 31) }),
      m('4', 4, { releaseDate: LocalDate.of(2021, 1, 1) }),
    ]),
  )
  kase('release date all null', () => agg([m('1', 1), m('2', 2)]))
  kase('summary number is the number string', () => aggregator.aggregate([m('Vol. 7', 7, { summary: 's' })]).summaryNumber)
  kase('NaN numberSort', () => agg([m('n', NaN, { summary: 'nan' }), m('1', 1, { summary: 'one' })]))
})
