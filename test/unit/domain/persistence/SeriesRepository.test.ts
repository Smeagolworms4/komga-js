// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/persistence/SeriesRepositoryOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { Library } from '../../../../src/domain/model/Library.js'
import { Series } from '../../../../src/domain/model/Series.js'
import type { SeriesRepository } from '../../../../src/domain/persistence/SeriesRepository.js'
import { URL } from '../../../../src/port/java-net.js'
import { OracleDb } from '../../db.js'
import { exceptionType, oracle, stable } from '../../oracle.js'

const { func, kase } = oracle('domain/persistence/SeriesRepository')

const db = new OracleDb()
const repo: SeriesRepository = db.seriesDao
const date = LocalDateTime.of(2020, 1, 1, 0, 0)
const series = new Series({ name: 'Série', url: new URL('file:/lib/s'), fileLastModified: date, id: 'S1', libraryId: 'L1', bookCount: 3, createdDate: date })

func('update', () => {
  kase('setup', () => {
    db.libraryDao.insert(new Library({ name: 'lib', root: new URL('file:/lib'), id: 'L1' }))
    db.libraryDao.insert(new Library({ name: 'lib2', root: new URL('file:/lib2'), id: 'L2' }))
    repo.insert(series)
    return stable(repo.findByIdOrNull('S1'))
  })
  kase('default updates modified time', () => {
    repo.update(series.copy({ name: 'renamed', bookCount: 5, oneshot: true }))
    return stable(repo.findByIdOrNull('S1'))
  })
  kase('without modified time', () => {
    repo.update((repo.findByIdOrNull('S1') as Series).copy({ name: 'again', deletedDate: LocalDateTime.of(2021, 6, 1, 12, 0), libraryId: 'L2' }), { updateModifiedTime: false })
    return stable(repo.findByIdOrNull('S1'))
  })
  kase('explicit true', () => {
    repo.update(series.copy({ url: new URL('file:/lib/s%20b') }), { updateModifiedTime: true })
    return stable(repo.findByIdOrNull('S1'))
  })
  kase('missing series', () => {
    repo.update(series.copy({ id: 'NOPE' }))
    return repo.count()
  })
  kase('unknown library', () => exceptionType(() => repo.update(series.copy({ libraryId: 'L9' }))))
})
