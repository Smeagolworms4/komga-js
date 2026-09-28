// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/PageHashKnownOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { PageHashKnown } from '../../../../src/domain/model/PageHashKnown.js'
import { eq } from '../../../../src/port/kotlin.js'
import { oracle, stable } from '../../oracle.js'

const { func, kase } = oracle('domain/model/PageHashKnown')

const date = LocalDateTime.of(2020, 1, 1, 0, 0)
const known = new PageHashKnown({ hash: 'abc', size: 100, action: PageHashKnown.Action.DELETE_AUTO, deleteCount: 2, matchCount: 3, createdDate: date, lastModifiedDate: date.plusDays(1) })

func('copy', () => {
  kase('no change', () => stable(known.copy()))
  kase('hash', () => stable(known.copy({ hash: 'def' })))
  kase('size null', () => stable(known.copy({ size: null })))
  kase('negative size', () => stable(known.copy({ size: -1 })))
  kase('zero size', () => stable(known.copy({ size: 0 })))
  kase('action', () => stable(known.copy({ action: PageHashKnown.Action.IGNORE })))
  kase('counts', () => stable(known.copy({ deleteCount: -5, matchCount: 2147483647 })))
  kase('dates reset', () => {
    const it = known.copy()
    return [eq(it.createdDate, date), eq(it.createdDate, it.lastModifiedDate)]
  })
  kase('class', () => known.copy().constructor.name)
})
