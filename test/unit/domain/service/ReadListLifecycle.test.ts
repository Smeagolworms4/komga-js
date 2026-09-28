// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/ReadListLifecycleOracleTest.kt
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { ReadList } from '../../../../src/domain/model/ReadList.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { SeriesMetadata } from '../../../../src/domain/model/SeriesMetadata.js'
import { ThumbnailBook } from '../../../../src/domain/model/ThumbnailBook.js'
import { ThumbnailReadList } from '../../../../src/domain/model/ThumbnailReadList.js'
import { sortedMapOf } from '../../../../src/port/extra-metadata.js'
import { nn } from '../../../../src/port/kotlin.js'
import { Pageable } from '../../../../src/port/spring-data.js'
import { OracleDb } from '../../db.js'
import { exceptionType, oracle, oracleBytes, stable } from '../../oracle.js'
import { ServiceGraph, book, date, library, metadata, resource, series } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/ReadListLifecycle')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const lifecycle = graph.readListLifecycle

const rl = (id: string, name = `rl ${id}`, ...books: [number, string][]) => new ReadList({ name, bookIds: sortedMapOf<number, string>(...books), id, createdDate: date })
const thumb = (id: string, readListId: string, selected = false) =>
  new ThumbnailReadList({
    thumbnail: oracleBytes(8),
    selected,
    type: ThumbnailReadList.Type.USER_UPLOADED,
    mediaType: 'image/jpeg',
    fileSize: 8,
    dimension: new Dimension({ width: 1, height: 2 }),
    id,
    readListId,
    createdDate: date,
  })
const find = (id: string) => db.readListDao.findByIdOrNull(id, SearchContext.empty())
const byName = (name: string) => db.readListDao.findByNameOrNull(name)
const thumbs = () => db.rawQuery('select ID, READLIST_ID, SELECTED from THUMBNAIL_READLIST order by ID')
const readLists = () => db.readListDao.findAll(SearchContext.empty(), Pageable.unpaged()).content.map((it) => [it.name, it.bookIds])
const b = (id: string) => nn(db.bookDao.findByIdOrNull(id))

func('addReadList', () => {
  kase('setup', () => {
    db.libraryDao.insert(library('L1'))
    db.seriesDao.insert(series('S1', 'L1'))
    db.seriesMetadataDao.insert(new SeriesMetadata({ title: 'Batman', seriesId: 'S1', createdDate: date }))
    for (let i = 1; i <= 6; i++) {
      const bk = book(`B${i}`, 'S1', 'L1', undefined, undefined, i)
      db.bookDao.insert(bk)
      db.bookMetadataDao.insert(metadata(bk))
    }
    return db.bookDao.count()
  })
  kase('new read list', () => stable([lifecycle.addReadList(rl('R1', 'rl R1', [1, 'B2'], [0, 'B1'])), graph.takeEvents()]))
  kase('duplicate name', () => lifecycle.addReadList(rl('R2', 'rl R1')))
  kase('duplicate name other case', () => lifecycle.addReadList(rl('R2', 'RL r1')))
  kase('empty read list', () => stable([lifecycle.addReadList(rl('R2')), graph.takeEvents()]))
  kase('unknown book', () => exceptionType(() => lifecycle.addReadList(rl('R3', 'rl R3', [0, 'B9']))))
  kase('after errors', () => stable([readLists(), graph.takeEvents()]))
})
func('updateReadList', () => {
  kase('unknown read list', () => lifecycle.updateReadList(rl('R9')))
  kase('rename to existing name', () => lifecycle.updateReadList(rl('R2', 'rl R1')))
  kase('rename to own name other case', () => {
    lifecycle.updateReadList(nn(find('R1')).copy({ name: 'RL R1' }))
    return stable([find('R1'), graph.takeEvents()])
  })
  kase('change books', () => {
    lifecycle.updateReadList(nn(find('R1')).copy({ bookIds: sortedMapOf<number, string>([5, 'B3'], [2, 'B1']), summary: 'sum', ordered: false }))
    return stable([find('R1'), graph.takeEvents()])
  })
})
func('addBookToReadList', () => {
  kase('already in read list', () => {
    lifecycle.addBookToReadList('RL R1', b('B1'), 7)
    return stable([find('R1'), graph.takeEvents()])
  })
  kase('free position', () => {
    lifecycle.addBookToReadList('RL R1', b('B4'), 3)
    return stable([find('R1'), graph.takeEvents()])
  })
  kase('taken position goes last', () => {
    lifecycle.addBookToReadList('rl r1', b('B5'), 2)
    return stable([find('R1'), graph.takeEvents()])
  })
  kase('null position goes last', () => {
    lifecycle.addBookToReadList('RL R1', b('B6'), null)
    return stable([find('R1'), graph.takeEvents()])
  })
  kase('new read list with position', () => {
    lifecycle.addBookToReadList('Brand new', b('B1'), 4)
    return stable([byName('Brand new'), graph.takeEvents()])
  })
  kase('new read list without position', () => {
    lifecycle.addBookToReadList('Other new', b('B2'), null)
    return stable([byName('Other new'), graph.takeEvents()])
  })
  kase('existing empty read list with null position', () => exceptionType(() => lifecycle.addBookToReadList('rl R2', b('B2'), null)))
  kase('existing empty read list with position', () => {
    lifecycle.addBookToReadList('rl R2', b('B2'), -1)
    return stable([find('R2'), graph.takeEvents()])
  })
})
func('addThumbnail', () => {
  kase('not selected', () => stable([lifecycle.addThumbnail(thumb('T1', 'R1')), thumbs(), graph.takeEvents()]))
  kase('selected', () => stable([lifecycle.addThumbnail(thumb('T2', 'R1', true)), thumbs(), graph.takeEvents()]))
  kase('selected replaces selection', () => stable([lifecycle.addThumbnail(thumb('T3', 'R1', true)), thumbs(), graph.takeEvents()]))
  kase('other read list', () => stable([lifecycle.addThumbnail(thumb('T4', 'R2')), thumbs(), graph.takeEvents()]))
  kase('unknown read list', () => exceptionType(() => lifecycle.addThumbnail(thumb('T5', 'R9'))))
})
func('markSelectedThumbnail', () => {
  kase('select T1', () => {
    lifecycle.markSelectedThumbnail(thumb('T1', 'R1'))
    return stable([thumbs(), graph.takeEvents()])
  })
  kase('unknown thumbnail', () => {
    lifecycle.markSelectedThumbnail(thumb('T9', 'R1'))
    return stable([thumbs(), graph.takeEvents()])
  })
})
func('deleteThumbnail', () => {
  kase('selected one', () => {
    lifecycle.deleteThumbnail(thumb('T1', 'R1', true))
    return stable([thumbs(), graph.takeEvents()])
  })
  kase('not selected one', () => {
    lifecycle.deleteThumbnail(thumb('T2', 'R1'))
    return stable([thumbs(), graph.takeEvents()])
  })
  kase('unknown thumbnail', () => {
    lifecycle.deleteThumbnail(thumb('T9', 'R2'))
    return stable([thumbs(), graph.takeEvents()])
  })
})
func('thumbnailsHouseKeeping', () => {
  kase('only unselected left', () => {
    db.thumbnailReadListDao.insert(thumb('T6', 'R2'))
    lifecycle.deleteThumbnail(thumb('T9', 'R2'))
    return stable([thumbs(), graph.takeEvents()])
  })
  kase('several selected', () => {
    db.thumbnailReadListDao.insert(thumb('T7', 'R2', true))
    db.thumbnailReadListDao.insert(thumb('T8', 'R2', true))
    lifecycle.deleteThumbnail(thumb('T9', 'R2'))
    return stable([thumbs(), graph.takeEvents()])
  })
  kase('none left', () => {
    for (const it of ['T4', 'T6', 'T7']) db.thumbnailReadListDao.delete(it)
    lifecycle.deleteThumbnail(thumb('T8', 'R2'))
    return stable([thumbs(), graph.takeEvents()])
  })
})
func('getThumbnailBytes', () => {
  kase('selected thumbnail', () => lifecycle.getThumbnailBytes(nn(find('R1'))))
  kase('mosaic without book thumbnail', async () => {
    db.thumbnailReadListDao.deleteByReadListId('R1')
    return graph.describeImage(await lifecycle.getThumbnailBytes(nn(find('R1'))))
  })
  kase('mosaic with book thumbnails', async () => {
    const png = resource('barcode/komga.png')
    for (const it of ['B1', 'B3']) {
      db.thumbnailBookDao.insert(
        new ThumbnailBook({
          thumbnail: png,
          selected: true,
          type: ThumbnailBook.Type.GENERATED,
          mediaType: 'image/png',
          fileSize: png.length,
          dimension: new Dimension({ width: 1, height: 1 }),
          id: `TB${it}`,
          bookId: it,
          createdDate: date,
        }),
      )
    }
    return graph.describeImage(await lifecycle.getThumbnailBytes(nn(find('R1'))))
  })
  kase('single book repeated', async () => graph.describeImage(await lifecycle.getThumbnailBytes(rl('RX', 'x', [0, 'B3']))))
  kase('more than 4 books', async () =>
    graph.describeImage(await lifecycle.getThumbnailBytes(rl('RX', 'x', [0, 'B2'], [1, 'B4'], [2, 'B5'], [3, 'B6'], [4, 'B1']))),
  )
})
func('matchComicRackList', () => {
  const cbl = (body: string) => Buffer.from(`<?xml version="1.0"?><ReadingList xmlns:xsd="http://www.w3.org/2001/XMLSchema">${body}</ReadingList>`)
  kase('matching books', () =>
    lifecycle.matchComicRackList(
      cbl('<Name>New list</Name><Books><Book Series="Batman" Number="1" Volume="2016" Year="2016"/><Book Series="batman" Number="3"/><Book Series="Robin" Number="1"/></Books>'),
    ),
  )
  kase('existing name', () => lifecycle.matchComicRackList(cbl('<Name>RL R1</Name><Books/>')))
  kase('no name', () => lifecycle.matchComicRackList(cbl('<Books/>')))
  kase('invalid xml', () => lifecycle.matchComicRackList(Buffer.from('not xml')))
  kase('empty', () => lifecycle.matchComicRackList(new Uint8Array(0)))
})
func('deleteReadList', () => {
  kase('with thumbnail', () => {
    db.thumbnailReadListDao.insert(thumb('T10', 'R2', true))
    lifecycle.deleteReadList(nn(find('R2')))
    return stable([find('R2'), thumbs(), graph.takeEvents()])
  })
  kase('unknown read list', () => {
    lifecycle.deleteReadList(rl('R9'))
    return stable(graph.takeEvents())
  })
})
func('deleteEmptyReadLists', () => {
  kase('setup', () => {
    lifecycle.addReadList(rl('E1'))
    lifecycle.addReadList(rl('E2'))
    db.thumbnailReadListDao.insert(thumb('T11', 'E1', true))
    graph.takeEvents()
    return readLists()
  })
  kase('deletes empty ones', () => {
    lifecycle.deleteEmptyReadLists()
    return stable([readLists(), thumbs(), graph.takeEvents()])
  })
  kase('nothing to delete', () => {
    lifecycle.deleteEmptyReadLists()
    return stable([readLists(), graph.takeEvents()])
  })
})
