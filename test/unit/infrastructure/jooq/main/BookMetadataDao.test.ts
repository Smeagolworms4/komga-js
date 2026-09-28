// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/BookMetadataDaoOracleTest.kt
import { LocalDate, LocalDateTime } from '@js-joda/core'
import { Author } from '../../../../../src/domain/model/Author.js'
import { BookMetadata } from '../../../../../src/domain/model/BookMetadata.js'
import { WebLink } from '../../../../../src/domain/model/WebLink.js'
import { URI } from '../../../../../src/port/java-net.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { book, library, series, sql } from './seed.js'

const { func, kase } = oracle('infrastructure/jooq/main/BookMetadataDao')

const db = new OracleDb()
const dao = db.bookMetadataDao

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
const mid = (it: number) => `M${String(it).padStart(4, '0')}`
const author = (name: string, role: string) => new Author({ name, role })
const link = (label: string, url: string) => new WebLink({ label, url: new URI(url) })
const FLOAT_MAX = 3.4028234663852886e38

const meta = (
  bookId: string,
  { numberSort = 1, authors = [], tags = new Set(), links = [] }: { numberSort?: number; authors?: Author[]; tags?: Set<string>; links?: WebLink[] } = {},
) => new BookMetadata({ title: `title ${bookId}`, number: `n${bookId}`, numberSort, authors, tags, links, bookId })

const full = new BookMetadata({
  title: '  Le Tïtre 漫画  ',
  summary: ' Résumé\r\nligne 2 ',
  number: ' 1.5 ',
  numberSort: 0.1,
  releaseDate: LocalDate.of(2004, 2, 29),
  authors: [author('  Jean Dupont ', ' WRITER '), author('Émilie Ünïcode', 'penciller'), author('Jean Dupont', 'writer'), author('漫画家', 'Translator')],
  tags: new Set(['Zeta', ' alpha ', 'ÜNÏCODE', '', '  ', '漫画']),
  isbn: '9782205054774',
  links: [link('Site', 'https://example.org/%C3%A9?q=1#frag'), link('Ünïcode label', 'https://漫画.example/path'), link('Site', 'file:/local/path')],
  titleLock: true,
  summaryLock: true,
  numberLock: true,
  numberSortLock: true,
  releaseDateLock: true,
  authorsLock: true,
  tagsLock: true,
  isbnLock: true,
  linksLock: true,
  bookId: 'B2',
  createdDate: LocalDateTime.of(2001, 1, 1, 0, 0),
})

const ids = (c: BookMetadata[]) => c.map((it) => it.bookId)

const counts = () =>
  db.rawQuery(
    'select (select count(*) from BOOK_METADATA), (select count(*) from BOOK_METADATA_AUTHOR), (select count(*) from BOOK_METADATA_TAG), (select count(*) from BOOK_METADATA_LINK)',
  )

func('count', () => {
  kase('empty', () => dao.count())
})

func('insert@74', () => {
  kase('minimal', () => {
    db.libraryDao.insert(library('L1'))
    db.seriesDao.insert(series('S1', 'L1'))
    db.bookDao.insert(range(1, 9).map((it) => book(`B${it}`, 'S1', 'L1')))
    db.bookDao.insert(range(1, 2200).map((it) => book(mid(it), 'S1', 'L1')))
    dao.insert(meta('B1'))
    return stable(dao.findById('B1'))
  })
  kase('all fields', () => {
    dao.insert(full)
    return stable(dao.findById('B2'))
  })
  kase('duplicate book', () => exceptionType(() => dao.insert(meta('B1'))))
  kase('unknown book', () => exceptionType(() => dao.insert(meta('NOPE'))))
  kase('NaN number sort', async () => [await exceptionType(() => dao.insert(meta('B9', { numberSort: NaN }))), stable(dao.findByIdOrNull('B9'))])
})

func('insert@79', () => {
  kase('empty', () => {
    dao.insert([])
    return dao.count()
  })
  kase('several', () => {
    dao.insert([
      meta('B5', { numberSort: -3.25, authors: [author('b', 'writer')] }),
      meta('B3', { numberSort: 1e10, tags: new Set(['t']) }),
      meta('B4', { numberSort: FLOAT_MAX, links: [link('l', 'https://example.org')] }),
    ])
    return stable(dao.findAllByIds(['B3', 'B4', 'B5']))
  })
  kase('more than batch size with authors in every chunk', () => {
    dao.insert(range(1, 1100).map((it) => meta(mid(it), { numberSort: it, authors: it === 1 || it === 1100 ? [author(`a${it}`, 'writer')] : [], tags: new Set([`tag${it}`]) })))
    return counts()
  })
  kase('more than batch size with authors only in the first chunk', async () => [
    await exceptionType(() => dao.insert(range(1101, 2200).map((it) => meta(mid(it), { numberSort: it, authors: it === 1101 ? [author(`a${it}`, 'writer')] : [] })))),
    counts(),
  ])
})

func('insertAuthors', () => {
  kase('rows', () => db.rawQuery("select * from BOOK_METADATA_AUTHOR where BOOK_ID like 'B%' order by BOOK_ID, rowid"))
})

func('insertTags', () => {
  kase('rows', () => db.rawQuery("select * from BOOK_METADATA_TAG where BOOK_ID like 'B%' order by BOOK_ID, rowid"))
})

func('insertLinks', () => {
  kase('rows', () => db.rawQuery('select * from BOOK_METADATA_LINK order by BOOK_ID, rowid'))
})

func('findById', () => {
  kase('existing', () => stable(dao.findById('B2')))
  kase('missing', () => dao.findById('NOPE'))
})

func('findByIdOrNull', () => {
  kase('existing', () => stable(dao.findByIdOrNull('B1')))
  kase('missing', () => dao.findByIdOrNull('NOPE'))
  kase('book without metadata', () => dao.findByIdOrNull('B6'))
})

func('findAllByIds', () => {
  kase('empty', () => dao.findAllByIds([]))
  kase('order of the result', () => ids(dao.findAllByIds(['B5', 'B2', 'B1', 'B3', 'NOPE'])))
  kase('duplicates', () => ids(dao.findAllByIds(['B1', 'B1'])))
  kase('missing only', () => dao.findAllByIds(new Set(['X', 'Y'])))
  kase('more than batch size', () => {
    const all = dao.findAllByIds([...range(1, 2200).map(mid), 'B1'])
    return [
      all.length,
      ids(all).slice(0, 3),
      ids(all).slice(-3),
      all.reduce((s, it) => s + it.authors.length, 0),
      all.reduce((s, it) => s + it.tags.size, 0),
    ]
  })
})

func('find', () => {
  kase('identical authors are merged', () => {
    sql(db, "insert into BOOK_METADATA_AUTHOR (NAME, ROLE, BOOK_ID) values ('b', 'writer', 'B5'), ('a', 'writer', 'B5')")
    return dao.findById('B5').authors.map((it) => [it.name, it.role])
  })
  kase('orphan authors are ignored', () => {
    sql(db, "insert into BOOK_METADATA_AUTHOR (NAME, ROLE, BOOK_ID) values ('orphan', 'writer', 'B6')")
    return dao.findByIdOrNull('B6')
  })
  kase('groups ordered by metadata columns', () => {
    sql(db, "update BOOK_METADATA set CREATED_DATE = '2020-01-0' || substr(BOOK_ID, 2) || ' 00:00:00' where BOOK_ID like 'B%'")
    sql(db, "update BOOK_METADATA set CREATED_DATE = '2019-12-31 00:00:00' where BOOK_ID = 'B4'")
    return ids(dao.findAllByIds(['B1', 'B2', 'B3', 'B4', 'B5']))
  })
})

func('findTags', () => {
  kase('normalized tags', () => dao.findById('B2').tags)
  kase('stored tags are not normalized', () => {
    sql(db, "insert into BOOK_METADATA_TAG (TAG, BOOK_ID) values ('Mixed CASE', 'B1')")
    return dao.findById('B1').tags
  })
})

func('findLinks', () => {
  kase('links', () => dao.findById('B2').links)
  kase('no link', () => dao.findById('B1').links)
  kase('invalid stored uri', () => {
    sql(db, "insert into BOOK_METADATA_LINK (LABEL, URL, BOOK_ID) values ('bad', 'https://exa mple.org', 'B1')")
    return exceptionType(() => dao.findById('B1'))
  })
})

func('toDomain@261', () => {
  kase('dates and number sort', () => {
    const it = dao.findById('B2')
    return [it.createdDate, it.numberSort, it.releaseDate, it.number, it.title]
  })
  kase('large number sort', () => dao.findAllByIds(['B3', 'B4', 'B5']).map((it) => it.numberSort))
})

func('toDomain@289', () => {
  kase('authors trimmed and lowercased', () => dao.findById('B2').authors.map((it) => [it.name, it.role]))
})

func('update@135', () => {
  kase('all fields', () => {
    sql(db, "delete from BOOK_METADATA_LINK where LABEL = 'bad'")
    dao.update(
      full.copy({
        title: 'Nouveau',
        summary: '',
        number: '2',
        numberSort: 2,
        releaseDate: null,
        authors: [author('Solo', 'Writer')],
        tags: new Set(['new']),
        isbn: '',
        links: [],
        titleLock: false,
        linksLock: false,
      }),
    )
    return stable(dao.findById('B2'))
  })
  kase('created date is kept', () => dao.findById('B2').createdDate)
  kase('missing book', () => {
    dao.update(meta('B7'))
    return dao.findByIdOrNull('B7')
  })
  kase('missing book with authors', () => exceptionType(() => dao.update(meta('NOPE', { authors: [author('a', 'b')] }))))
})

func('update@140', () => {
  kase('empty', () => {
    dao.update([])
    return dao.count()
  })
  kase('several', () => {
    dao.update([meta('B1', { numberSort: 10, tags: new Set(['x', 'y']) }), meta('B3', { numberSort: 30, authors: [author('c', 'inker')] })])
    return stable(dao.findAllByIds(['B1', 'B3']))
  })
})

func('updateMetadata', () => {
  kase('removes previous authors, tags and links', () => {
    dao.update(meta('B4'))
    const it = dao.findById('B4')
    return [[it.authors, it.tags, it.links], db.rawQuery("select count(*) from BOOK_METADATA_LINK where BOOK_ID = 'B4'")]
  })
  kase('last modified date', () => stable(dao.findById('B4').lastModifiedDate))
})

func('delete@242', () => {
  kase('existing', () => {
    dao.delete('B2')
    return [dao.findByIdOrNull('B2'), counts()]
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return counts()
  })
})

func('delete@250', () => {
  kase('empty', () => {
    dao.delete([])
    return counts()
  })
  kase('several', () => {
    dao.delete(['B3', 'NOPE', 'B3'])
    return counts()
  })
  kase('more than batch size', () => {
    dao.delete(range(1, 2200).map(mid))
    return [counts(), ids(dao.findAllByIds(range(1, 9).map((it) => `B${it}`)))]
  })
})

func('count', () => {
  kase('after deletions', () => dao.count())
})
