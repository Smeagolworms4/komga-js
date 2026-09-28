// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/SeriesCollectionLifecycleOracleTest.kt
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { SeriesCollection } from '../../../../src/domain/model/SeriesCollection.js'
import { ThumbnailSeries } from '../../../../src/domain/model/ThumbnailSeries.js'
import { ThumbnailSeriesCollection } from '../../../../src/domain/model/ThumbnailSeriesCollection.js'
import { nn } from '../../../../src/port/kotlin.js'
import { Pageable } from '../../../../src/port/spring-data.js'
import { OracleDb } from '../../db.js'
import { exceptionType, oracle, oracleBytes, stable } from '../../oracle.js'
import { ServiceGraph, date, library, resource, series } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/SeriesCollectionLifecycle')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const lifecycle = graph.seriesCollectionLifecycle

const col = (id: string, name = `col ${id}`, seriesIds: string[] = []) => new SeriesCollection({ name, seriesIds, id, createdDate: date })
const thumb = (id: string, collectionId: string, selected = false) =>
  new ThumbnailSeriesCollection({
    thumbnail: oracleBytes(8),
    selected,
    type: ThumbnailSeriesCollection.Type.USER_UPLOADED,
    mediaType: 'image/jpeg',
    fileSize: 8,
    dimension: new Dimension({ width: 1, height: 2 }),
    id,
    collectionId,
    createdDate: date,
  })
const find = (id: string) => db.seriesCollectionDao.findByIdOrNull(id, SearchContext.empty())
const thumbs = () => db.rawQuery('select ID, COLLECTION_ID, SELECTED from THUMBNAIL_COLLECTION order by ID')
const collections = () => db.seriesCollectionDao.findAll(SearchContext.empty(), Pageable.unpaged()).content.map((it) => [it.name, it.seriesIds])
const s = (id: string) => nn(db.seriesDao.findByIdOrNull(id))

func('addCollection', () => {
  kase('setup', () => {
    db.libraryDao.insert(library('L1'))
    for (let i = 1; i <= 6; i++) db.seriesDao.insert(series(`S${i}`, 'L1'))
    return db.seriesDao.count()
  })
  kase('new collection', () => stable([lifecycle.addCollection(col('C1', undefined, ['S2', 'S1'])), graph.takeEvents()]))
  kase('duplicate name', () => lifecycle.addCollection(col('C2', 'col C1')))
  kase('duplicate name other case', () => lifecycle.addCollection(col('C2', 'COL c1')))
  kase('empty collection', () => stable([lifecycle.addCollection(col('C2')), graph.takeEvents()]))
  kase('unknown series', () => exceptionType(() => lifecycle.addCollection(col('C3', undefined, ['S9']))))
  kase('duplicate id', () => exceptionType(() => lifecycle.addCollection(col('C1', 'other'))))
  kase('after errors', () => stable([collections(), graph.takeEvents()]))
})
func('updateCollection', () => {
  kase('unknown collection', () => lifecycle.updateCollection(col('C9')))
  kase('rename to existing name', () => lifecycle.updateCollection(col('C2', 'col C1')))
  kase('rename to own name other case', () => {
    lifecycle.updateCollection(nn(find('C1')).copy({ name: 'COL C1' }))
    return stable([find('C1'), graph.takeEvents()])
  })
  kase('change series and order', () => {
    lifecycle.updateCollection(nn(find('C1')).copy({ seriesIds: ['S3', 'S1', 'S2'], ordered: true }))
    return stable([find('C1'), graph.takeEvents()])
  })
})
func('addSeriesToCollection', () => {
  kase('already in collection', () => {
    lifecycle.addSeriesToCollection('COL C1', s('S1'))
    return stable([find('C1'), graph.takeEvents()])
  })
  kase('existing collection', () => {
    lifecycle.addSeriesToCollection('COL C1', s('S4'))
    return stable([find('C1'), graph.takeEvents()])
  })
  kase('existing collection, name case differs', () => {
    lifecycle.addSeriesToCollection('col c1', s('S5'))
    return stable([find('C1'), graph.takeEvents()])
  })
  kase('new collection', () => {
    lifecycle.addSeriesToCollection('Brand new', s('S1'))
    return stable([db.seriesCollectionDao.findByNameOrNull('Brand new'), graph.takeEvents()])
  })
  kase('empty name', () => {
    lifecycle.addSeriesToCollection('', s('S1'))
    return stable([db.seriesCollectionDao.findByNameOrNull(''), graph.takeEvents()])
  })
})
func('addThumbnail', () => {
  kase('not selected', () => stable([lifecycle.addThumbnail(thumb('T1', 'C1')), thumbs(), graph.takeEvents()]))
  kase('selected', () => stable([lifecycle.addThumbnail(thumb('T2', 'C1', true)), thumbs(), graph.takeEvents()]))
  kase('selected replaces selection', () => stable([lifecycle.addThumbnail(thumb('T3', 'C1', true)), thumbs(), graph.takeEvents()]))
  kase('other collection', () => stable([lifecycle.addThumbnail(thumb('T4', 'C2')), thumbs(), graph.takeEvents()]))
  kase('unknown collection', () => exceptionType(() => lifecycle.addThumbnail(thumb('T5', 'C9'))))
})
func('markSelectedThumbnail', () => {
  kase('select T1', () => {
    lifecycle.markSelectedThumbnail(thumb('T1', 'C1'))
    return stable([thumbs(), graph.takeEvents()])
  })
  kase('unknown thumbnail', () => {
    lifecycle.markSelectedThumbnail(thumb('T9', 'C1'))
    return stable([thumbs(), graph.takeEvents()])
  })
})
func('deleteThumbnail', () => {
  kase('selected one', () => {
    lifecycle.deleteThumbnail(thumb('T1', 'C1', true))
    return stable([thumbs(), graph.takeEvents()])
  })
  kase('not selected one', () => {
    lifecycle.deleteThumbnail(thumb('T2', 'C1'))
    return stable([thumbs(), graph.takeEvents()])
  })
  kase('unknown thumbnail', () => {
    lifecycle.deleteThumbnail(thumb('T9', 'C2'))
    return stable([thumbs(), graph.takeEvents()])
  })
})
func('thumbnailsHouseKeeping', () => {
  kase('only unselected left', () => {
    db.thumbnailSeriesCollectionDao.insert(thumb('T6', 'C2'))
    lifecycle.deleteThumbnail(thumb('T9', 'C2'))
    return stable([thumbs(), graph.takeEvents()])
  })
  kase('several selected', () => {
    db.thumbnailSeriesCollectionDao.insert(thumb('T7', 'C2', true))
    db.thumbnailSeriesCollectionDao.insert(thumb('T8', 'C2', true))
    lifecycle.deleteThumbnail(thumb('T9', 'C2'))
    return stable([thumbs(), graph.takeEvents()])
  })
  kase('none left', () => {
    for (const it of ['T4', 'T6', 'T7']) db.thumbnailSeriesCollectionDao.delete(it)
    lifecycle.deleteThumbnail(thumb('T8', 'C2'))
    return stable([thumbs(), graph.takeEvents()])
  })
})
func('getThumbnailBytes', () => {
  kase('selected thumbnail', () => lifecycle.getThumbnailBytes(nn(find('C1')), 'U1'))
  kase('mosaic without series thumbnail', async () => {
    db.thumbnailSeriesCollectionDao.deleteByCollectionId('C1')
    return graph.describeImage(await lifecycle.getThumbnailBytes(nn(find('C1')), 'U1'))
  })
  kase('mosaic with series thumbnails', async () => {
    const png = resource('barcode/komga.png')
    for (const it of ['S1', 'S3']) {
      db.thumbnailSeriesDao.insert(
        new ThumbnailSeries({
          thumbnail: png,
          selected: true,
          type: ThumbnailSeries.Type.USER_UPLOADED,
          mediaType: 'image/png',
          fileSize: png.length,
          dimension: new Dimension({ width: 1, height: 1 }),
          id: `TS${it}`,
          seriesId: it,
          createdDate: date,
        }),
      )
    }
    return graph.describeImage(await lifecycle.getThumbnailBytes(nn(find('C1')), 'U1'))
  })
  kase('single series repeated', async () => graph.describeImage(await lifecycle.getThumbnailBytes(col('CX', undefined, ['S3']), 'U1')))
  kase('more than 4 series', async () => graph.describeImage(await lifecycle.getThumbnailBytes(col('CX', undefined, ['S2', 'S4', 'S5', 'S6', 'S1']), 'U1')))
})
func('deleteCollection', () => {
  kase('with thumbnail', () => {
    db.thumbnailSeriesCollectionDao.insert(thumb('T10', 'C2', true))
    lifecycle.deleteCollection(nn(find('C2')))
    return stable([find('C2'), thumbs(), graph.takeEvents()])
  })
  kase('unknown collection', () => {
    lifecycle.deleteCollection(col('C9'))
    return stable(graph.takeEvents())
  })
})
func('deleteEmptyCollections', () => {
  kase('setup', () => {
    lifecycle.addCollection(col('E1'))
    lifecycle.addCollection(col('E2'))
    db.thumbnailSeriesCollectionDao.insert(thumb('T11', 'E1', true))
    graph.takeEvents()
    return collections()
  })
  kase('deletes empty ones', () => {
    lifecycle.deleteEmptyCollections()
    return stable([collections(), thumbs(), graph.takeEvents()])
  })
  kase('nothing to delete', () => {
    lifecycle.deleteEmptyCollections()
    return stable([collections(), graph.takeEvents()])
  })
})
