// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/kobo/dto/ReadingStateDtoOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { R2Locator } from '../../../../../../src/domain/model/R2Locator.js'
import { ReadProgress } from '../../../../../../src/domain/model/ReadProgress.js'
import { toDto } from '../../../../../../src/interfaces/api/kobo/dto/ReadingStateDto.js'
import { oracle } from '../../../../oracle.js'
import { mapper } from '../../../../web-oracle.js'

const { func, kase } = oracle('interfaces/api/kobo/dto/ReadingStateDto')

const date = LocalDateTime.of(2020, 1, 2, 3, 4, 5)
const json = (p: ReadProgress) => mapper().writeValueAsString(toDto(p))
const f32 = Math.fround

func('toDto', () => {
  kase('in progress without locator', () => json(new ReadProgress({ bookId: 'B1', userId: 'U1', page: 3, completed: false, readDate: date, createdDate: date, lastModifiedDate: date.plusHours(1) })))
  kase('completed', () => json(new ReadProgress({ bookId: 'B1', userId: 'U1', page: 3, completed: true, readDate: date, createdDate: date, lastModifiedDate: date.plusMinutes(1) })))
  kase('locator with progressions', () =>
    json(
      new ReadProgress({
        bookId: 'B1',
        userId: 'U1',
        page: 3,
        completed: false,
        readDate: date,
        locator: new R2Locator({ href: 'OEBPS/ch1.xhtml', type: 'application/xhtml+xml', koboSpan: 'kobo.1.2', locations: new R2Locator.Location({ progression: f32(0.25), totalProgression: f32(0.123) }) }),
        createdDate: date,
      }),
    ),
  )
  kase('locator without locations', () =>
    json(new ReadProgress({ bookId: 'B1', userId: 'U1', page: 1, completed: false, readDate: date, locator: new R2Locator({ href: 'a.xhtml', type: 't' }), createdDate: date })),
  )
  kase('progression precision', () =>
    json(
      new ReadProgress({
        bookId: 'B1',
        userId: 'U1',
        page: 1,
        completed: false,
        readDate: date,
        locator: new R2Locator({ href: 'a', type: 't', locations: new R2Locator.Location({ progression: f32(0.1), totalProgression: f32(1 / 3) }) }),
        createdDate: date,
      }),
    ),
  )
  kase('summer time', () => json(new ReadProgress({ bookId: 'B1', userId: 'U1', page: 1, completed: false, readDate: date, createdDate: LocalDateTime.of(2021, 7, 1, 12, 0, 0, 500_000_000) })))
})
