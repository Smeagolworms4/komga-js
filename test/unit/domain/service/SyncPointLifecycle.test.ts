// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/service/SyncPointLifecycleOracleTest.kt
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { ReadList } from '../../../../src/domain/model/ReadList.js'
import { ReadProgress } from '../../../../src/domain/model/ReadProgress.js'
import { SeriesMetadata } from '../../../../src/domain/model/SeriesMetadata.js'
import { SyncPointLifecycle } from '../../../../src/domain/service/SyncPointLifecycle.js'
import { sortedMapOf } from '../../../../src/port/extra-metadata.js'
import { nn } from '../../../../src/port/kotlin.js'
import { PageRequest, Pageable } from '../../../../src/port/spring-data.js'
import { OracleDb } from '../../db.js'
import { exceptionType, oracle, stable } from '../../oracle.js'
import { book, date, library, metadata, series } from './serviceGraph.js'

const { func, kase } = oracle('domain/service/SyncPointLifecycle')

const db = new OracleDb()
const lifecycle = new SyncPointLifecycle(db.syncPointDao)

const u1 = new KomgaUser({ email: 'u1@example.org', password: 'p', id: 'U1', createdDate: date })
const u2 = new KomgaUser({ email: 'u2@example.org', password: 'p', sharedAllLibraries: false, sharedLibrariesIds: new Set(['L1']), id: 'U2', createdDate: date })

const ids = new Map<string, string>()

function addBook(id: string, seriesId: string, libraryId: string, number: number, status = Media.Status.READY, mediaType = 'application/epub+zip') {
  const b = book(id, seriesId, libraryId, undefined, undefined, number).copy({ fileSize: 1000 + number, fileHash: `h${id}` })
  db.bookDao.insert(b)
  db.mediaDao.insert(new Media({ status, mediaType, bookId: id, createdDate: date }))
  db.bookMetadataDao.insert(metadata(b))
}

const sp = (name: string) => nn(ids.get(name))
const rl = (name: string, id: string, ...entries: [number, string][]) => new ReadList({ name, bookIds: sortedMapOf<number, string>(...entries), id, createdDate: date })

func('createSyncPoint', () => {
  kase('setup', () => {
    db.libraryDao.insert(library('L1'))
    db.libraryDao.insert(library('L2'))
    db.seriesDao.insert(series('S1', 'L1'))
    db.seriesMetadataDao.insert(new SeriesMetadata({ title: 'S1', seriesId: 'S1', createdDate: date }))
    db.seriesDao.insert(series('S2', 'L2'))
    db.seriesMetadataDao.insert(new SeriesMetadata({ title: 'S2', seriesId: 'S2', createdDate: date }))
    addBook('B1', 'S1', 'L1', 1)
    addBook('B2', 'S1', 'L1', 2)
    addBook('B3', 'S2', 'L2', 1)
    addBook('B4', 'S1', 'L1', 3, Media.Status.UNKNOWN)
    addBook('B5', 'S1', 'L1', 4, undefined, 'application/zip')
    db.komgaUserDao.insert(u1)
    db.komgaUserDao.insert(u2)
    db.readListDao.insert(rl('RL1', 'RL1', [1, 'B1'], [2, 'B3']))
    db.readListDao.insert(rl('RL2', 'RL2', [1, 'B4']))
    db.readListDao.insert(rl('RL3', 'RL3', [1, 'B2']))
    return db.bookDao.count()
  })
  const create = (name: string, ...args: Parameters<SyncPointLifecycle['createSyncPoint']>) => {
    const it = lifecycle.createSyncPoint(...args)
    ids.set(name, it.id)
    return stable(it)
  }
  kase('all libraries', () => create('all', u1, null, null))
  kase('one library', () => create('L1', u1, null, ['L1']))
  kase('empty library list', () => create('none', u1, null, []))
  kase('restricted user', () => create('u2', u2, null, null))
  kase('unknown api key', () => exceptionType(() => lifecycle.createSyncPoint(u1, 'APIKEY', null)))
  kase('unknown user', () => exceptionType(() => lifecycle.createSyncPoint(u1.copy({ id: 'U9' }), null, null)))
})
func('takeBooks', () => {
  kase('all libraries, unpaged', () => stable(lifecycle.takeBooks(sp('all'), Pageable.unpaged())))
  kase('all libraries, again', () => stable(lifecycle.takeBooks(sp('all'), Pageable.unpaged())))
  kase('one library, page of 1', () => stable(lifecycle.takeBooks(sp('L1'), PageRequest.of(0, 1))))
  kase('one library, next page of 1', () => stable(lifecycle.takeBooks(sp('L1'), PageRequest.of(0, 1))))
  kase('one library, rest', () => stable(lifecycle.takeBooks(sp('L1'), Pageable.unpaged())))
  kase('empty library list', () => stable(lifecycle.takeBooks(sp('none'), Pageable.unpaged())))
  kase('restricted user', () => stable(lifecycle.takeBooks(sp('u2'), Pageable.unpaged())))
  kase('unknown sync point', () => stable(lifecycle.takeBooks('NOPE', Pageable.unpaged())))
})
func('takeReadLists', () => {
  kase('all libraries', () => stable(lifecycle.takeReadLists(sp('all'), Pageable.unpaged())))
  kase('all libraries, again', () => stable(lifecycle.takeReadLists(sp('all'), Pageable.unpaged())))
  kase('one library, page of 1', () => stable(lifecycle.takeReadLists(sp('L1'), PageRequest.of(0, 1))))
  kase('restricted user', () => stable(lifecycle.takeReadLists(sp('u2'), Pageable.unpaged())))
})
func('takeBooksAdded', () => {
  kase('changes then new sync point', () => {
    // changed: B1 hash, removed: B2 soft-deleted, added: B6, read progress on B3
    db.bookDao.update(nn(db.bookDao.findByIdOrNull('B1')).copy({ fileHash: 'changed' }))
    db.bookDao.update(nn(db.bookDao.findByIdOrNull('B2')).copy({ deletedDate: date }))
    addBook('B6', 'S2', 'L2', 2)
    db.readProgressDao.save(new ReadProgress({ bookId: 'B3', userId: 'U1', page: 5, completed: false, readDate: date }))
    db.readListDao.update(rl('RL1 renamed', 'RL1', [1, 'B1'], [2, 'B3']))
    db.readListDao.delete('RL3')
    db.readListDao.insert(rl('RL4', 'RL4', [1, 'B6']))
    ids.set('all2', lifecycle.createSyncPoint(u1, null, null).id)
    ids.set('L12', lifecycle.createSyncPoint(u1, null, ['L1']).id)
    return true
  })
  kase('all', () => stable(lifecycle.takeBooksAdded(sp('all'), sp('all2'), Pageable.unpaged())))
  kase('all, again', () => stable(lifecycle.takeBooksAdded(sp('all'), sp('all2'), Pageable.unpaged())))
  kase('one library', () => stable(lifecycle.takeBooksAdded(sp('L1'), sp('L12'), Pageable.unpaged())))
  kase('same sync point', () => stable(lifecycle.takeBooksAdded(sp('all'), sp('all'), Pageable.unpaged())))
})
func('takeBooksChanged', () => {
  kase('all', () => stable(lifecycle.takeBooksChanged(sp('all'), sp('all2'), Pageable.unpaged())))
  kase('all, again', () => stable(lifecycle.takeBooksChanged(sp('all'), sp('all2'), Pageable.unpaged())))
  kase('one library, page of 1', () => stable(lifecycle.takeBooksChanged(sp('L1'), sp('L12'), PageRequest.of(0, 1))))
})
func('takeBooksRemoved', () => {
  kase('all', () => stable(lifecycle.takeBooksRemoved(sp('all'), sp('all2'), Pageable.unpaged())))
  kase('all, again', () => stable(lifecycle.takeBooksRemoved(sp('all'), sp('all2'), Pageable.unpaged())))
  kase('one library', () => stable(lifecycle.takeBooksRemoved(sp('L1'), sp('L12'), Pageable.unpaged())))
  kase('reverse order', () => stable(lifecycle.takeBooksRemoved(sp('all2'), sp('all'), Pageable.unpaged())))
})
func('takeBooksReadProgressChanged', () => {
  kase('all', () => stable(lifecycle.takeBooksReadProgressChanged(sp('all'), sp('all2'), Pageable.unpaged())))
  kase('all, again', () => stable(lifecycle.takeBooksReadProgressChanged(sp('all'), sp('all2'), Pageable.unpaged())))
  kase('one library', () => stable(lifecycle.takeBooksReadProgressChanged(sp('L1'), sp('L12'), Pageable.unpaged())))
})
func('takeReadListsAdded', () => {
  kase('all', () => stable(lifecycle.takeReadListsAdded(sp('all'), sp('all2'), Pageable.unpaged())))
  kase('all, again', () => stable(lifecycle.takeReadListsAdded(sp('all'), sp('all2'), Pageable.unpaged())))
  kase('one library', () => stable(lifecycle.takeReadListsAdded(sp('L1'), sp('L12'), Pageable.unpaged())))
})
func('takeReadListsChanged', () => {
  kase('all', () => stable(lifecycle.takeReadListsChanged(sp('all'), sp('all2'), Pageable.unpaged())))
  kase('all, again', () => stable(lifecycle.takeReadListsChanged(sp('all'), sp('all2'), Pageable.unpaged())))
  kase('one library', () => stable(lifecycle.takeReadListsChanged(sp('L1'), sp('L12'), Pageable.unpaged())))
})
func('takeReadListsRemoved', () => {
  kase('all', () => stable(lifecycle.takeReadListsRemoved(sp('all'), sp('all2'), Pageable.unpaged())))
  kase('all, again', () => stable(lifecycle.takeReadListsRemoved(sp('all'), sp('all2'), Pageable.unpaged())))
  kase('one library', () => stable(lifecycle.takeReadListsRemoved(sp('L1'), sp('L12'), Pageable.unpaged())))
})
