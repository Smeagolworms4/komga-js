// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/SeriesMetadataLifecycleOracleTest.kt
import { LocalDate } from '@js-joda/core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Author } from '../../../../src/domain/model/Author.js'
import { BookMetadataAggregation } from '../../../../src/domain/model/BookMetadataAggregation.js'
import type { Library } from '../../../../src/domain/model/Library.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { SearchContext } from '../../../../src/domain/model/SearchContext.js'
import { SeriesMetadata } from '../../../../src/domain/model/SeriesMetadata.js'
import { URL } from '../../../../src/port/java-net.js'
import { nn } from '../../../../src/port/kotlin.js'
import { Pageable } from '../../../../src/port/spring-data.js'
import { OracleDb } from '../../db.js'
import { t } from '../../infrastructure/mediacontainer/oracleZip.js'
import { exceptionType, oracle, stable, tempDir } from '../../oracle.js'
import { ServiceGraph, attempt, book, date, library, metadata, resource, series, zipFile } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/SeriesMetadataLifecycle')

const db = new OracleDb()
const graph = new ServiceGraph(db)
const lifecycle = graph.seriesMetadataLifecycle

let dirPath: string | null = null
const dir = () => {
  if (dirPath === null) {
    dirPath = join(tempDir(), 'lib')
    mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}
const png = resource('barcode/komga.png')
const comicInfo = (body: string) => t('ComicInfo.xml', `<?xml version="1.0"?><ComicInfo>${body}</ComicInfo>`)

function addSeries(id: string, oneshot = false) {
  mkdirSync(join(dir(), id), { recursive: true })
  db.seriesDao.insert(series(id, 'L1', new URL(`file:${dir()}/${id}`)).copy({ oneshot }))
  db.seriesMetadataDao.insert(new SeriesMetadata({ title: `series ${id}`, seriesId: id, createdDate: date }))
  db.bookMetadataAggregationDao.insert(new BookMetadataAggregation({ seriesId: id, createdDate: date }))
}

function addBook(id: string, seriesId: string, info: string | null) {
  const entries: [string, Uint8Array | null][] = [['p1.png', png]]
  if (info !== null) entries.push(comicInfo(info))
  const bk = book(id, seriesId, 'L1', undefined, zipFile(join(dir(), seriesId), `${id}.cbz`, entries))
  db.bookDao.insert(bk)
  db.mediaDao.insert(new Media({ bookId: id, createdDate: date }))
  db.bookMetadataDao.insert(metadata(bk))
  graph.bookLifecycle.analyzeAndPersist(bk)
}

const s = (id: string) => nn(db.seriesDao.findByIdOrNull(id))
const names = () => graph.takeEvents().map((e) => (e as object).constructor.name)

const state = (id: string) =>
  attempt(dir(), () => {
    const it = db.seriesMetadataDao.findById(id)
    return [
      [it.status, it.title, it.titleSort, it.summary, it.readingDirection, it.publisher, it.ageRating, it.language, it.genres, it.totalBookCount],
      db.seriesCollectionDao.findAll(SearchContext.empty(), Pageable.unpaged()).content.map((c) => [c.name, c.seriesIds]),
      names(),
    ]
  })
const lib = (block: (l: Library) => Library) => db.libraryDao.update(block(db.libraryDao.findById('L1')))

func('refreshMetadata', () => {
  kase('setup', () => {
    db.libraryDao.insert(library('L1', new URL(`file:${dir()}`)))
    addSeries('S1')
    addBook(
      'B1',
      'S1',
      '<Series>Batman</Series><Volume>2016</Volume><Manga>YesAndRightToLeft</Manga><Publisher>DC</Publisher><AgeRating>Teen</AgeRating><LanguageISO>en</LanguageISO><Genre>Action, Hero</Genre><Count>10</Count><SeriesGroup>Group A, Group B</SeriesGroup>',
    )
    addBook(
      'B2',
      'S1',
      '<Series>Batman</Series><Volume>2016</Volume><Manga>No</Manga><Publisher>Marvel</Publisher><AgeRating>Mature 17+</AgeRating><LanguageISO>fr</LanguageISO><Genre>Drama</Genre><Count>12</Count><SeriesGroup>Group A</SeriesGroup>',
    )
    addBook('B3', 'S1', '<Series>Robin</Series><Publisher>DC</Publisher><LanguageISO>not a language tag!</LanguageISO>')
    addBook('B4', 'S1', null)
    addSeries('S2')
    writeFileSync(
      join(dir(), 'S2/series.json'),
      '{"version":"1.0.2","metadata":{"type":"comicSeries","publisher":"DC Comics","imprint":null,"name":"Batman","comicid":"1","year":2016,"description_text":"text","description_formatted":"formatted","volume":3,"booktype":"Print","age_rating":"15+","comic_image":"x","total_issues":100,"publication_run":"x","status":"Ended"}}',
    )
    addBook('B5', 'S2', '<Series>Other</Series>')
    addSeries('S3', true)
    addBook('B6', 'S3', '<Title>One shot title</Title><Summary>one shot summary</Summary><Series>OS</Series>')
    db.bookMetadataDao.update(db.bookMetadataDao.findById('B6').copy({ title: 'One shot title', summary: 'one shot summary' }))
    addSeries('S4')
    writeFileSync(join(dir(), 'S4/series.json'), '{ not json')
    graph.takeEvents()
    return true
  })
  kase('comic info, defaults', () => {
    lifecycle.refreshMetadata(s('S1'))
    return state('S1')
  })
  kase('comic info, append volume disabled', () => {
    lib((it) => it.copy({ importComicInfoSeriesAppendVolume: false }))
    lifecycle.refreshMetadata(s('S1'))
    return state('S1')
  })
  kase('locked fields', () => {
    db.seriesMetadataDao.update(db.seriesMetadataDao.findById('S1').copy({ title: 'locked', titleLock: true, genresLock: true, publisherLock: true }))
    lifecycle.refreshMetadata(s('S1'))
    return state('S1')
  })
  kase('mylar and comic info', () => {
    lifecycle.refreshMetadata(s('S2'))
    return state('S2')
  })
  kase('oneshot', () => {
    lifecycle.refreshMetadata(s('S3'))
    return state('S3')
  })
  kase('invalid mylar json', () => {
    lifecycle.refreshMetadata(s('S4'))
    return state('S4')
  })
  kase('series import disabled, collections enabled', () => {
    lib((it) => it.copy({ importComicInfoSeries: false, importMylarSeries: false }))
    db.seriesMetadataDao.update(new SeriesMetadata({ title: 'series S1', seriesId: 'S1', createdDate: date }))
    lifecycle.refreshMetadata(s('S1'))
    return state('S1')
  })
  kase('everything disabled but oneshot', async () => {
    lib((it) => it.copy({ importComicInfoCollection: false, importEpubSeries: false }))
    lifecycle.refreshMetadata(s('S1'))
    const a = await state('S1')
    lifecycle.refreshMetadata(s('S2'))
    return [a, await state('S2')]
  })
  kase('unknown library', () => exceptionType(() => lifecycle.refreshMetadata(s('S1').copy({ libraryId: 'L9' }))))
})
func('handlePatchForSeriesMetadata@102', () => {
  kase('most frequent values, max numbers', () => {
    lib((it) => it.copy({ importComicInfoSeries: true }))
    db.seriesMetadataDao.update(new SeriesMetadata({ title: 'series S1', seriesId: 'S1', createdDate: date }))
    lifecycle.refreshMetadata(s('S1'))
    return state('S1')
  })
  kase('no patch at all', () => {
    addSeries('S5')
    lifecycle.refreshMetadata(s('S5'))
    return state('S5')
  })
})
func('handlePatchForSeriesMetadata@129', () => {
  kase('single patch from mylar', () => {
    lib((it) => it.copy({ importMylarSeries: true, importComicInfoSeries: false }))
    lifecycle.refreshMetadata(s('S2'))
    return state('S2')
  })
  kase('null patch', () => {
    lifecycle.refreshMetadata(s('S5'))
    return state('S5')
  })
})
func('aggregateMetadata', () => {
  kase('books metadata', () => {
    db.bookMetadataDao.update(
      db.bookMetadataDao
        .findById('B1')
        .copy({ summary: 'first', releaseDate: LocalDate.of(2010, 1, 1), authors: [new Author({ name: 'A', role: 'writer' })], tags: new Set(['x']) }),
    )
    db.bookMetadataDao.update(
      db.bookMetadataDao.findById('B2').copy({
        summary: 'second',
        releaseDate: LocalDate.of(2005, 6, 1),
        authors: [new Author({ name: 'A', role: 'writer' }), new Author({ name: 'B', role: 'penciller' })],
        tags: new Set(['y']),
      }),
    )
    // findAllByIds groupe sur toutes les colonnes de BOOK_METADATA (CREATED_DATE, LAST_MODIFIED_DATE d'abord) : dates fixes
    // pour un ordre B1, B2 déterministe (LocalDateTime.now() à la milliseconde côté JS, ex æquo possibles)
    db.dsl.execute("update BOOK_METADATA set CREATED_DATE = '2020-01-02 03:04:05', LAST_MODIFIED_DATE = '2020-01-02 03:04:05'")
    db.dsl.execute("update BOOK_METADATA set LAST_MODIFIED_DATE = '2020-01-02 03:04:06' where BOOK_ID = 'B1'")
    db.dsl.execute("update BOOK_METADATA set LAST_MODIFIED_DATE = '2020-01-02 03:04:07' where BOOK_ID = 'B2'")
    lifecycle.aggregateMetadata(s('S1'))
    return stable([db.bookMetadataAggregationDao.findById('S1'), names()])
  })
  kase('series without books', () => {
    lifecycle.aggregateMetadata(s('S5'))
    return stable([db.bookMetadataAggregationDao.findById('S5'), names()])
  })
  kase('unknown series', () => {
    lifecycle.aggregateMetadata(series('S9', 'L1'))
    return stable(names())
  })
})
