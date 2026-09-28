// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/PageHashControllerOracleTest.kt
import { PageHashKnown } from '../../../../../src/domain/model/PageHashKnown.js'
import { TypedBytes } from '../../../../../src/domain/model/TypedBytes.js'
import type { PageHashLifecycle } from '../../../../../src/domain/service/PageHashLifecycle.js'
import { PageHashController } from '../../../../../src/interfaces/api/rest/PageHashController.js'
import { PageHashCreationDto } from '../../../../../src/interfaces/api/rest/dto/PageHashCreationDto.js'
import { PageHashMatchDto } from '../../../../../src/interfaces/api/rest/dto/PageHashMatchDto.js'
import { IllegalArgumentException } from '../../../../../src/port/kotlin.js'
import { Order, PageRequest, Pageable, Sort } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { exceptionType, oracle, stable } from '../../../oracle.js'
import { Calls, FIXED, entity, taskEmitter, tasks } from './rest-oracle.js'
import * as samples from './rest-samples.js'

const { func, kase } = oracle('interfaces/api/rest/PageHashController')

const db = new OracleDb()
const calls = new Calls()

/** Enregistre les appels, répond selon l'empreinte (même faux côté Kotlin) */
const lifecycle = {
  getPage: async (hash: string, { resizeTo = null }: { resizeTo?: number | null } = {}) => {
    calls.add('getPage', hash, resizeTo)
    if (hash === 'ph1') return new TypedBytes({ bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/jpeg' })
    if (hash === 'ph2') return new TypedBytes({ bytes: new Uint8Array([4]), mediaType: 'not a media type' })
    return null
  },
  createOrUpdate: async (p: PageHashKnown) => {
    calls.add('createOrUpdate', p.hash, p.size, p.action, p.deleteCount, p.matchCount)
    if (p.hash === 'bad') throw new IllegalArgumentException('bad hash')
  },
} as unknown as PageHashLifecycle

const c = new PageHashController(db.pageHashDao, lifecycle, taskEmitter(db, calls))
const p20 = PageRequest.of(0, 20)
const known = (hash: string, size: number | null, action: PageHashKnown.Action) => new PageHashKnown({ hash, size, action, createdDate: FIXED })
const creation = (hash: string, size: number | null, action: PageHashKnown.Action) => new PageHashCreationDto({ hash, size, action })

func('getKnownPageHashes', () => {
  kase('empty', () => c.getKnownPageHashes(null, p20))
  kase('all', () => {
    samples.seed(db)
    db.pageHashDao.insert(known('ph1', 100, PageHashKnown.Action.DELETE_AUTO), new Uint8Array([9, 8]))
    db.pageHashDao.insert(known('zz', null, PageHashKnown.Action.IGNORE), null)
    db.pageHashDao.insert(known('ph3', 300, PageHashKnown.Action.DELETE_MANUAL), null)
    return stable(c.getKnownPageHashes(null, p20))
  })
  kase('by actions', () => stable(c.getKnownPageHashes([PageHashKnown.Action.IGNORE, PageHashKnown.Action.DELETE_MANUAL], p20)))
  kase('empty actions', () => stable(c.getKnownPageHashes([], p20)))
  kase('sorted, paged', () => stable(c.getKnownPageHashes(null, PageRequest.of(0, 2, Sort.by(Order.desc('hash'))))))
  kase('unpaged', () => stable(c.getKnownPageHashes(null, Pageable.unpaged())))
})
func('getKnownPageHashThumbnail', () => {
  kase('with thumbnail', () => c.getKnownPageHashThumbnail('ph1'))
  kase('without thumbnail', () => c.getKnownPageHashThumbnail('zz'))
  kase('unknown', () => c.getKnownPageHashThumbnail('nope'))
})
func('getUnknownPageHashes', () => {
  kase('default', () => c.getUnknownPageHashes(p20))
  kase('page 1 of 1', () => c.getUnknownPageHashes(PageRequest.of(1, 1)))
  kase('unpaged', () => c.getUnknownPageHashes(Pageable.unpaged()))
})
func('getPageHashMatches', () => {
  kase('ph2', () => c.getPageHashMatches('ph2', p20))
  kase('paged', () => c.getPageHashMatches('ph1', PageRequest.of(1, 2)))
  kase('sorted by url desc', () => c.getPageHashMatches('ph1', PageRequest.of(0, 20, Sort.by(Order.desc('url')))))
  kase('unknown', () => c.getPageHashMatches('nope', p20))
})
func('getUnknownPageHashThumbnail', () => {
  kase('jpeg', async () => [await entity(await c.getUnknownPageHashThumbnail('ph1', 200)), calls.take()])
  kase('invalid media type', async () => [await entity(await c.getUnknownPageHashThumbnail('ph2')), calls.take()])
  kase('not found', async () => [await exceptionType(() => c.getUnknownPageHashThumbnail('nope')), calls.take()])
})
func('createOrUpdateKnownPageHash', () => {
  kase('ok', async () => {
    await c.createOrUpdateKnownPageHash(creation('abc', 12, PageHashKnown.Action.DELETE_AUTO))
    return calls.take()
  })
  kase('no size', async () => {
    await c.createOrUpdateKnownPageHash(creation('abc', null, PageHashKnown.Action.IGNORE))
    return calls.take()
  })
  kase('illegal argument', async () => [await exceptionType(() => c.createOrUpdateKnownPageHash(creation('bad', 1, PageHashKnown.Action.IGNORE))), calls.take()])
  kase('illegal argument message', async () => {
    try {
      await c.createOrUpdateKnownPageHash(creation('bad', 1, PageHashKnown.Action.IGNORE))
      return null
    } catch (e) {
      return [(e as Error).message, calls.take()]
    }
  })
})
func('deleteDuplicatePagesByPageHash', () => {
  kase('matches in several books', () => {
    c.deleteDuplicatePagesByPageHash('ph1')
    return [tasks(db), calls.take()]
  })
  kase('unknown hash', () => {
    c.deleteDuplicatePagesByPageHash('nope')
    return [tasks(db), calls.take()]
  })
})
func('deleteSingleMatchByPageHash', () => {
  kase('match', () => {
    c.deleteSingleMatchByPageHash(
      'ph3',
      new PageHashMatchDto({ bookId: 'B2', url: '/lib1/Alpha/Alpha-2.cbz', pageNumber: 3, fileName: 'p3.jpg', fileSize: 300, mediaType: 'image/jpeg' }),
    )
    return [tasks(db), calls.take()]
  })
})
