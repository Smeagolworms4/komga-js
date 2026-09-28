// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/R2ProgressionOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { R2Locator } from '../../../../src/domain/model/R2Locator.js'
import { toR2Progression } from '../../../../src/domain/model/R2Progression.js'
import { ReadProgress } from '../../../../src/domain/model/ReadProgress.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/R2Progression')

const date = LocalDateTime.of(2020, 1, 1, 0, 0)

const progress = (readDate: LocalDateTime, deviceId = '', deviceName = '', locator: R2Locator | null = null) =>
  new ReadProgress({ bookId: 'B1', userId: 'U1', page: 5, completed: false, readDate, deviceId, deviceName, locator, createdDate: date })

func('toR2Progression', () => {
  kase('defaults', () => toR2Progression(progress(LocalDateTime.of(2021, 1, 15, 10, 20, 30))))
  kase('summer time', () => toR2Progression(progress(LocalDateTime.of(2021, 7, 15, 10, 20, 30, 123456789), 'dev', 'Kobo')))
  kase('dst gap', () => toR2Progression(progress(LocalDateTime.of(2021, 3, 28, 2, 30))).modified)
  kase('dst overlap', () => toR2Progression(progress(LocalDateTime.of(2021, 10, 31, 2, 30))).modified)
  kase('epoch', () => toR2Progression(progress(LocalDateTime.of(1970, 1, 1, 0, 0))).modified)
  kase('far', () => toR2Progression(progress(LocalDateTime.of(9999, 12, 31, 23, 59, 59, 999999999))).modified)
  kase('with locator', () =>
    toR2Progression(
      progress(
        date,
        'd',
        'n',
        new R2Locator({
          href: 'ch1.xhtml',
          type: 'application/xhtml+xml',
          title: 'Chapter',
          locations: new R2Locator.Location({ fragments: ['f'], progression: 0.1, position: 3, totalProgression: 0.25 }),
          text: new R2Locator.Text({ after: 'a', before: 'b', highlight: 'h' }),
          koboSpan: 'span',
        }),
      ),
    ),
  )
  kase('unicode device', () => toR2Progression(progress(date, 'é', '漫画 reader')).device)
})
