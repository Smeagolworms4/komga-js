// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/jooq/main/BookDaoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { AgeRestriction, AllowExclude } from '../../../../../src/domain/model/AgeRestriction.js'
import { Book } from '../../../../../src/domain/model/Book.js'
import { BookMetadata } from '../../../../../src/domain/model/BookMetadata.js'
import { ContentRestrictions } from '../../../../../src/domain/model/ContentRestrictions.js'
import { Media } from '../../../../../src/domain/model/Media.js'
import { ReadStatus } from '../../../../../src/domain/model/ReadStatus.js'
import { SearchCondition } from '../../../../../src/domain/model/SearchCondition.js'
import { SearchContext } from '../../../../../src/domain/model/SearchContext.js'
import { SearchOperator } from '../../../../../src/domain/model/SearchOperator.js'
import { URL } from '../../../../../src/port/java-net.js'
import { Direction, Order, PageRequest, Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { book, library, series, sql, user } from './seed.js'

const { func, kase } = oracle('infrastructure/jooq/main/BookDao')

const db = new OracleDb()
const dao = db.bookDao

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
const mid = (it: number) => `M${String(it).padStart(4, '0')}`
const sorted = (l: Iterable<string>) => [...l].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

const deletedDate = LocalDateTime.of(2021, 1, 1, 0, 0)
const unicodeUrl = new URL('file:/libraries/L1/S2/Ünï côde 漫画.cbz')

const ids = (c: Iterable<Book>) => sorted([...c].map((it) => it.id))

const page = (condition: SearchCondition.Book | null, context: SearchContext = SearchContext.empty(), pageable: Pageable = Pageable.unpaged()) => {
  const p = dao.findAll(condition, context, pageable)
  return [p.content.map((it) => it.id), p.totalElements, p.number, p.size]
}

const meta = (bookId: string, numberSort: number, title: string = `title ${bookId}`) => new BookMetadata({ title, number: bookId, numberSort, bookId })

const is = <T>(value: T) => new SearchOperator.Is({ value })

func('count', () => {
  kase('empty', () => dao.count())
})

func('findAll@114', () => {
  kase('empty', () => dao.findAll())
})

func('insert@313', () => {
  kase('single book', () => {
    db.libraryDao.insert(library('L1'))
    db.libraryDao.insert(library('L2'))
    db.libraryDao.insert(library('L3'))
    db.seriesDao.insert(series('S1', 'L1'))
    db.seriesDao.insert(series('S2', 'L1'))
    db.seriesDao.insert(series('S3', 'L2'))
    db.komgaUserDao.insert(user('U1'))
    db.komgaUserDao.insert(user('U2'))
    dao.insert(book('B1', 'S1', 'L1', { number: 1, fileSize: 100 }))
    return stable(dao.findByIdOrNull('B1'))
  })
  kase('all fields', () => {
    dao.insert(
      new Book({
        name: 'Ünïcode 漫画 book',
        url: unicodeUrl,
        fileLastModified: LocalDateTime.of(2021, 3, 28, 2, 30, 15, 123456789),
        fileSize: 5_000_000_000,
        fileHash: 'abcdef',
        fileHashKoreader: 'kor1',
        number: -3,
        id: 'BU',
        seriesId: 'S2',
        libraryId: 'L1',
        deletedDate: null,
        oneshot: true,
      }),
    )
    return stable(dao.findByIdOrNull('BU'))
  })
  kase('duplicate id', () => exceptionType(() => dao.insert(book('B1', 'S1', 'L1'))))
  kase('unknown series', () => exceptionType(() => dao.insert(book('BN', 'NOPE', 'L1'))))
  kase('series of another library', () => {
    dao.insert(book('BW', 'S3', 'L1', { number: 99 }))
    return dao.getLibraryIdOrNull('BW')
  })
})

func('insert@318', () => {
  kase('empty', () => {
    dao.insert([])
    return dao.count()
  })
  kase('several', () => {
    dao.insert([
      book('B2', 'S1', 'L1', { number: 2, fileSize: 200 }),
      book('B3', 'S1', 'L1', { number: 3, fileSize: 300, ext: 'cbr' }),
      book('B4', 'S1', 'L1', { number: 4, fileSize: 400, ext: 'pdf' }),
      book('B5', 'S1', 'L1', { number: 5, fileSize: 500 }),
      book('B6', 'S1', 'L1', { number: 6, fileSize: 600 }),
      book('BX', 'S1', 'L1', { number: 8 }),
      book('B7', 'S2', 'L1', { number: 7, fileSize: 500 }),
      book('C1', 'S3', 'L2', { number: 11, fileSize: 1100 }),
      book('C2', 'S3', 'L2', { number: 12, fileSize: 1200, ext: 'CBZ' }),
      book('D1', 'S1', 'L1', { number: 20, fileSize: 500 }).copy({ deletedDate }),
      book('D2', 'S2', 'L1', { number: 21, fileSize: 500 }).copy({ deletedDate, url: unicodeUrl }),
    ])
    return dao.count()
  })
  kase('more than batch size', () => {
    dao.insert(range(1, 1100).map((it) => book(mid(it), 'S2', 'L2', { number: 1000 + it, fileSize: it })))
    return [dao.count(), dao.findAllIdsBySeriesId('S2').length]
  })
  kase('stored values', () => {
    // fixed, distinct dates
    sql(
      db,
      "update BOOK set CREATED_DATE = datetime('2020-02-01 00:00:00', '+' || abs(NUMBER) || ' hours'), LAST_MODIFIED_DATE = datetime('2020-03-01 00:00:00', '+' || abs(NUMBER) || ' hours')",
      "update BOOK set LAST_MODIFIED_DATE = '2019-01-01 00:00:00' where ID = 'D2'",
    )
    return db.rawQuery(
      "select ID, NAME, URL, NUMBER, FILE_LAST_MODIFIED, FILE_SIZE, FILE_HASH, FILE_HASH_KOREADER, LIBRARY_ID, SERIES_ID, DELETED_DATE, ONESHOT, CREATED_DATE from BOOK where ID not like 'M%' order by ID",
    )
  })
})

func('findByIdOrNull', () => {
  kase('existing', () => dao.findByIdOrNull('B3'))
  kase('missing', () => dao.findByIdOrNull('NOPE'))
  kase('deleted book', () => dao.findByIdOrNull('D1')?.deletedDate ?? null)
})

func('toDomain', () => {
  kase('file last modified is not converted', () => dao.findByIdOrNull('BU')!.fileLastModified)
  kase('dates in current time zone', () => {
    const it = dao.findByIdOrNull('B2')!
    return [it.createdDate, it.lastModifiedDate]
  })
  kase('url and path', () => {
    const it = dao.findByIdOrNull('BU')!
    return [it.url, it.path]
  })
})

func('findNotDeletedByLibraryIdAndUrlOrNull', () => {
  const f = (libraryId: string, url: URL) => dao.findNotDeletedByLibraryIdAndUrlOrNull(libraryId, url)
  kase('existing', () => f('L1', new URL('file:/libraries/L1/S1/B2.cbz'))?.id ?? null)
  kase('unicode url, deleted duplicate ignored', () => f('L1', unicodeUrl)?.id ?? null)
  kase('deleted book', () => f('L1', new URL('file:/libraries/L1/S1/D1.cbz')))
  kase('other library', () => f('L2', new URL('file:/libraries/L1/S1/B2.cbz')))
  kase('url is case sensitive', () => f('L1', new URL('file:/libraries/L1/S1/b2.cbz')))
  kase('most recently modified first', () => {
    dao.insert(book('B2BIS', 'S2', 'L1', { number: 30 }).copy({ url: new URL('file:/libraries/L1/S1/B2.cbz') }))
    sql(db, "update BOOK set LAST_MODIFIED_DATE = '2025-01-01 00:00:00' where ID = 'B2BIS'")
    return f('L1', new URL('file:/libraries/L1/S1/B2.cbz'))?.id ?? null
  })
  kase('most recently modified first, other order', () => {
    sql(db, "update BOOK set LAST_MODIFIED_DATE = '2015-01-01 00:00:00' where ID = 'B2BIS'")
    return f('L1', new URL('file:/libraries/L1/S1/B2.cbz'))?.id ?? null
  })
})

func('findAllBySeriesId', () => {
  kase('series', () => ids(dao.findAllBySeriesId('S1')))
  kase('missing', () => dao.findAllBySeriesId('NOPE'))
})

func('findAllBySeriesIds', () => {
  kase('empty', () => dao.findAllBySeriesIds([]))
  kase('several', () => ids(dao.findAllBySeriesIds(['S1', 'S3', 'NOPE', 'S1'])))
  kase('more than batch size', () => ids(dao.findAllBySeriesIds([...range(1, 1500).map((it) => `X${it}`), 'S3', 'S1'])))
})

func('findAllNotDeletedByLibraryIdAndUrlNotIn', () => {
  kase('no url', () => ids(dao.findAllNotDeletedByLibraryIdAndUrlNotIn('L1', [])))
  kase('some urls', () =>
    ids(dao.findAllNotDeletedByLibraryIdAndUrlNotIn('L1', [new URL('file:/libraries/L1/S1/B2.cbz'), unicodeUrl, new URL('file:/nope')])),
  )
  kase('more than batch size', () =>
    ids(
      dao.findAllNotDeletedByLibraryIdAndUrlNotIn('L2', [
        ...range(1, 1090).map((it) => new URL(`file:/libraries/L2/S2/${mid(it)}.cbz`)),
        ...range(1, 500).map((it) => new URL(`file:/x${it}`)),
      ]),
    ),
  )
  kase('unknown library', () => dao.findAllNotDeletedByLibraryIdAndUrlNotIn('NOPE', []))
})

func('findAllDeletedByFileSize', () => {
  kase('deleted', () => ids(dao.findAllDeletedByFileSize(500)))
  kase('none', () => dao.findAllDeletedByFileSize(100))
  kase('large size', () => dao.findAllDeletedByFileSize(5_000_000_000))
})

func('findAll@114', () => {
  kase('all', () => dao.findAll().length)
  kase('first books', () => ids(dao.findAll()).slice(0, 20))
})

func('getLibraryIdOrNull', () => {
  kase('existing', () => dao.getLibraryIdOrNull('C1'))
  kase('missing', () => dao.getLibraryIdOrNull('NOPE'))
})

func('getSeriesIdOrNull', () => {
  kase('existing', () => dao.getSeriesIdOrNull('B7'))
  kase('missing', () => dao.getSeriesIdOrNull('NOPE'))
})

func('existsById', () => {
  kase('existing', () => dao.existsById('D2'))
  kase('missing', () => dao.existsById('NOPE'))
  kase('case sensitive', () => dao.existsById('b1'))
})

func('findAllIdsBySeriesId', () => {
  kase('series', () => sorted(dao.findAllIdsBySeriesId('S1')))
  kase('missing', () => dao.findAllIdsBySeriesId('NOPE'))
})

func('findAllIdsByLibraryId', () => {
  kase('library', () => sorted(dao.findAllIdsByLibraryId('L1')))
  kase('empty library', () => dao.findAllIdsByLibraryId('L3'))
})

func('findFirstIdInSeriesOrNull', () => {
  kase('without metadata', () => dao.findFirstIdInSeriesOrNull('S3'))
  kase('missing series', () => dao.findFirstIdInSeriesOrNull('NOPE'))
  kase('with metadata', () => {
    db.bookMetadataDao.insert([
      meta('B1', 1, 'Ünïcode é'),
      meta('B2', 2, 'Deuxième'),
      meta('B3', 2.5),
      meta('B4', 3),
      meta('B5', 10, 'cinq é'),
      meta('B6', -1),
      meta('D1', -5),
      meta('B7', 1),
      meta('C1', 2),
      meta('C2', 1),
    ])
    return [dao.findFirstIdInSeriesOrNull('S1'), dao.findFirstIdInSeriesOrNull('S3')]
  })
  kase('book without metadata sorts first', () => {
    sql(db, "delete from BOOK_METADATA where BOOK_ID = 'D1'")
    return dao.findFirstIdInSeriesOrNull('S1')
  })
})

func('findLastIdInSeriesOrNull', () => {
  kase('with metadata', () => [dao.findLastIdInSeriesOrNull('S1'), dao.findLastIdInSeriesOrNull('S3')])
  kase('missing series', () => dao.findLastIdInSeriesOrNull('NOPE'))
})

func('findFirstUnreadIdInSeriesOrNull', () => {
  kase('no progress', () => dao.findFirstUnreadIdInSeriesOrNull('S3', 'U1'))
  kase('first books read', () => {
    sql(
      db,
      "insert into READ_PROGRESS (BOOK_ID, USER_ID, PAGE, COMPLETED) values ('C2', 'U1', 10, 1), ('C1', 'U2', 1, 0), ('BX', 'U1', 3, 1), ('D1', 'U1', 3, 1), ('B6', 'U1', 5, 0), ('B1', 'U2', 2, 1)",
    )
    return [dao.findFirstUnreadIdInSeriesOrNull('S3', 'U1'), dao.findFirstUnreadIdInSeriesOrNull('S3', 'U2')]
  })
  kase('in progress counts as unread', () => dao.findFirstUnreadIdInSeriesOrNull('S1', 'U1'))
  kase('other user', () => dao.findFirstUnreadIdInSeriesOrNull('S1', 'U2'))
  kase('all read', () => {
    sql(db, "insert into READ_PROGRESS (BOOK_ID, USER_ID, PAGE, COMPLETED) values ('C1', 'U1', 10, 1)")
    return dao.findFirstUnreadIdInSeriesOrNull('S3', 'U1')
  })
  kase('unknown user', () => dao.findFirstUnreadIdInSeriesOrNull('S1', 'NOPE'))
})

func('findAllByLibraryIdAndMediaTypes', () => {
  kase('setup', () => {
    const media = (status: Media.Status, mediaType: string | null, bookId: string) => new Media({ status, mediaType, bookId })
    db.mediaDao.insert([
      media(Media.Status.READY, 'application/zip', 'B1'),
      media(Media.Status.READY, 'application/zip', 'B2'),
      media(Media.Status.READY, 'application/zip', 'B3'),
      media(Media.Status.READY, 'application/pdf', 'B4'),
      media(Media.Status.ERROR, null, 'B5'),
      media(Media.Status.READY, 'application/zip', 'C1'),
      media(Media.Status.READY, 'application/zip', 'C2'),
      media(Media.Status.READY, 'application/epub+zip', 'BU'),
    ])
    return db.mediaDao.count()
  })
  kase('one type', () => ids(dao.findAllByLibraryIdAndMediaTypes('L1', ['application/zip'])))
  kase('several types', () => ids(dao.findAllByLibraryIdAndMediaTypes('L1', new Set(['application/pdf', 'application/epub+zip', 'nope']))))
  kase('no type', () => dao.findAllByLibraryIdAndMediaTypes('L1', []))
  kase('media type is case sensitive', () => dao.findAllByLibraryIdAndMediaTypes('L1', ['APPLICATION/ZIP']))
  kase('other library', () => ids(dao.findAllByLibraryIdAndMediaTypes('L2', ['application/zip'])))
})

func('findAllByLibraryIdAndMismatchedExtension', () => {
  const f = (libraryId: string, mediaType: string, extension: string) => dao.findAllByLibraryIdAndMismatchedExtension(libraryId, mediaType, extension)
  kase('mismatched', () => ids(f('L1', 'application/zip', 'cbz')))
  kase('like is case insensitive', () => ids(f('L2', 'application/zip', 'cbz')))
  kase('uppercase extension', () => ids(f('L1', 'application/zip', 'CBZ')))
  kase('wildcard in extension', () => ids(f('L1', 'application/zip', 'c_r')))
  kase('percent extension', () => ids(f('L1', 'application/zip', '%')))
  kase('empty extension', () => ids(f('L1', 'application/pdf', '')))
  kase('unknown media type', () => f('L1', 'nope', 'cbz'))
})

func('update@362', () => {
  kase('all fields', () => {
    dao.update(
      dao.findByIdOrNull('B1')!.copy({
        name: 'Renamed ünï',
        url: new URL('file:/libraries/L1/S1/renamed.cbz'),
        number: 100,
        fileLastModified: LocalDateTime.of(2022, 2, 2, 2, 2, 2),
        fileSize: 12345,
        fileHash: 'hash1',
        fileHashKoreader: 'kor1',
        deletedDate: LocalDateTime.of(2023, 3, 3, 3, 3, 3),
        oneshot: true,
      }),
    )
    return stable(dao.findByIdOrNull('B1'))
  })
  kase('restore', () => {
    dao.update(dao.findByIdOrNull('B1')!.copy({ deletedDate: null, oneshot: false, fileHash: '' }))
    return stable(dao.findByIdOrNull('B1'))
  })
  kase('move to another series', () => {
    dao.update(dao.findByIdOrNull('B7')!.copy({ seriesId: 'S3', libraryId: 'L2' }))
    return [dao.getSeriesIdOrNull('B7'), dao.getLibraryIdOrNull('B7')]
  })
  kase('unknown series', () => exceptionType(() => dao.update(dao.findByIdOrNull('B7')!.copy({ seriesId: 'NOPE' }))))
  kase('missing book', () => {
    dao.update(book('NOPE', 'S1', 'L1'))
    return dao.existsById('NOPE')
  })
  kase('created date is kept', () => dao.findByIdOrNull('B1')!.createdDate)
})

func('update@367', () => {
  kase('empty', () => {
    dao.update([])
    return dao.count()
  })
  kase('several', () => {
    dao.update([dao.findByIdOrNull('B2')!.copy({ fileHashKoreader: 'kor1' }), dao.findByIdOrNull('C1')!.copy({ fileHash: '', fileHashKoreader: '' })])
    return stable([dao.findByIdOrNull('B2'), dao.findByIdOrNull('C1')])
  })
  kase('failure in the middle', async () => [
    await exceptionType(() => dao.update([dao.findByIdOrNull('B3')!.copy({ name: 'first' }), dao.findByIdOrNull('B4')!.copy({ seriesId: 'NOPE' })])),
    dao.findByIdOrNull('B3')!.name,
  ])
})

func('updateBook', () => {
  kase('last modified date', () => stable(dao.findByIdOrNull('B2')!.lastModifiedDate))
})

func('findAllByLibraryIdAndWithEmptyHash', () => {
  kase('library', () => ids(dao.findAllByLibraryIdAndWithEmptyHash('L1')))
  kase('unknown library', () => dao.findAllByLibraryIdAndWithEmptyHash('NOPE'))
})

func('findAllByLibraryIdAndWithEmptyHashKoreader', () => {
  kase('library', () => ids(dao.findAllByLibraryIdAndWithEmptyHashKoreader('L1')))
  kase('other library', () => ids(dao.findAllByLibraryIdAndWithEmptyHashKoreader('L2')).length)
})

func('findAllByHashKoreader', () => {
  kase('several', () => ids(dao.findAllByHashKoreader('kor1')))
  kase('empty hash', () => ids(dao.findAllByHashKoreader('')).length)
  kase('case sensitive', () => dao.findAllByHashKoreader('KOR1'))
})

func('findAll@120', () => {
  const u1 = user('U1')
  const limited = user('U9').copy({ sharedAllLibraries: false, sharedLibrariesIds: new Set(['L2']) })
  kase('no condition', () => page(null))
  kase('no condition, paged and sorted', () => page(null, undefined, PageRequest.of(1, 5, Sort.by('number'))))
  kase('library', () => page(new SearchCondition.LibraryId({ operator: is('L2') }), undefined, PageRequest.of(0, 3, Sort.by(Direction.DESC, 'number'))))
  kase('library is not', () =>
    page(new SearchCondition.LibraryId({ operator: new SearchOperator.IsNot({ value: 'L2' }) }), undefined, PageRequest.of(0, 50, Sort.by('number'))),
  )
  kase('all of', () =>
    page(
      SearchCondition.AllOfBook.of(new SearchCondition.LibraryId({ operator: is('L1') }), new SearchCondition.Deleted({ operator: SearchOperator.IsFalse })),
      undefined,
      PageRequest.of(0, 4, Sort.by('number')),
    ),
  )
  kase('any of', () =>
    page(
      SearchCondition.AnyOfBook.of(new SearchCondition.SeriesId({ operator: is('S3') }), new SearchCondition.SeriesId({ operator: is('S1') })),
      undefined,
      PageRequest.of(0, 5, Sort.by(Order.desc('seriesId'), Order.asc('number'))),
    ),
  )
  kase('deleted', () => page(new SearchCondition.Deleted({ operator: SearchOperator.IsTrue }), undefined, PageRequest.of(0, 10, Sort.by('createdDate'))))
  kase('oneshot', () => page(new SearchCondition.OneShot({ operator: SearchOperator.IsTrue })))
  kase('title contains', () =>
    page(new SearchCondition.Title({ operator: new SearchOperator.Contains({ value: 'é' }) }), undefined, PageRequest.of(0, 10, Sort.by('number'))),
  )
  kase('title begins with, case insensitive', () => page(new SearchCondition.Title({ operator: new SearchOperator.BeginsWith({ value: 'DEUX' }) })))
  kase('number sort', () =>
    page(new SearchCondition.NumberSort({ operator: new SearchOperator.GreaterThan({ value: 1.5 }) }), undefined, PageRequest.of(0, 10, Sort.by('number'))),
  )
  kase('media status', () => page(new SearchCondition.MediaStatus({ operator: is(Media.Status.READY) }), undefined, PageRequest.of(0, 10, Sort.by('number'))))
  kase('read status read', () =>
    page(new SearchCondition.ReadStatus({ operator: is(ReadStatus.READ) }), new SearchContext(u1), PageRequest.of(0, 10, Sort.by('number'))),
  )
  kase('read status in progress', () => page(new SearchCondition.ReadStatus({ operator: is(ReadStatus.IN_PROGRESS) }), new SearchContext(u1)))
  kase('read status unread in series', () =>
    page(
      SearchCondition.AllOfBook.of(new SearchCondition.SeriesId({ operator: is('S1') }), new SearchCondition.ReadStatus({ operator: is(ReadStatus.UNREAD) })),
      new SearchContext(u1),
      PageRequest.of(0, 20, Sort.by('number')),
    ),
  )
  kase('read status without user', () => page(new SearchCondition.ReadStatus({ operator: is(ReadStatus.READ) })))
  kase('read list', () => page(new SearchCondition.ReadListId({ operator: is('RL1') })))
  kase('not in read list', () =>
    page(
      SearchCondition.AllOfBook.of(
        new SearchCondition.ReadListId({ operator: new SearchOperator.IsNot({ value: 'RL1' }) }),
        new SearchCondition.LibraryId({ operator: is('L1') }),
      ),
      undefined,
      PageRequest.of(0, 3, Sort.by('number')),
    ),
  )
  kase('limited user', () => page(null, new SearchContext(limited), PageRequest.of(0, 3, Sort.by(Direction.DESC, 'number'))))
  kase('restricted user', () => {
    const r = user('U8').copy({ restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 10, restriction: AllowExclude.ALLOW_ONLY }) }) })
    return page(new SearchCondition.SeriesId({ operator: is('S3') }), new SearchContext(r))
  })
  kase('unknown sort', () => page(null, undefined, PageRequest.of(0, 2, Sort.by('name'))))
  kase('page beyond the end', () => page(new SearchCondition.SeriesId({ operator: is('S1') }), undefined, PageRequest.of(5, 10)))
  kase('unpaged sorted', () => page(new SearchCondition.SeriesId({ operator: is('S1') }), undefined, Pageable.unpaged(Sort.by(Direction.DESC, 'number'))))
  kase('anonymous user', () => page(new SearchCondition.SeriesId({ operator: is('S3') }), SearchContext.ofAnonymousUser()))
  kase('page content', () =>
    stable(dao.findAll(new SearchCondition.SeriesId({ operator: is('S3') }), SearchContext.empty(), PageRequest.of(0, 1, Sort.by('number')))),
  )
})

func('countGroupedByLibraryId', () => {
  kase('counts', () => dao.countGroupedByLibraryId())
})

func('getFilesizeGroupedByLibraryId', () => {
  kase('sizes', () => dao.getFilesizeGroupedByLibraryId())
})

func('delete@390', () => {
  kase('book with dependencies', () => exceptionType(() => dao.delete('C1')))
  kase('existing', () => {
    dao.delete('BW')
    return dao.existsById('BW')
  })
  kase('missing', () => {
    dao.delete('NOPE')
    return dao.count()
  })
})

func('delete@395', () => {
  kase('empty', () => {
    dao.delete([])
    return dao.count()
  })
  kase('several', () => {
    dao.delete(['B2BIS', 'NOPE', 'B2BIS'])
    return dao.count()
  })
  kase('more than batch size', () => {
    dao.delete([...range(1, 1100).map(mid), ...range(1, 500).map((it) => `X${it}`)])
    return [dao.count(), dao.countGroupedByLibraryId()]
  })
})

func('deleteAll', () => {
  kase('with dependencies', () => exceptionType(() => dao.deleteAll()))
  kase('all', () => {
    sql(db, 'delete from READ_PROGRESS', 'delete from BOOK_METADATA', 'delete from MEDIA', 'delete from READ_PROGRESS_SERIES')
    dao.deleteAll()
    return [dao.count(), dao.findAll(), dao.countGroupedByLibraryId(), dao.getFilesizeGroupedByLibraryId()]
  })
})
