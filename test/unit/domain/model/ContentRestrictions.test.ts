// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/ContentRestrictionsOracleTest.kt
import { AgeRestriction, AllowExclude } from '../../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../../src/domain/model/ContentRestrictions.js'
import { eq } from '../../../../src/port/kotlin.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/ContentRestrictions')

const age = (age: number, restriction: AllowExclude) => new AgeRestriction({ age, restriction })
const cr = (p: ConstructorParameters<typeof ContentRestrictions>[0] = {}) => new ContentRestrictions(p)

func('<init>', () => {
  kase('defaults', () => cr())
  kase('age', () => cr({ ageRestriction: age(12, AllowExclude.ALLOW_ONLY) }))
  kase('labels normalized', () => cr({ labelsAllow: new Set([' Kids ', 'KIDS', '', '  ', 'Teen']), labelsExclude: new Set(['GORE', ' gore', '\t']) }))
  kase('exclude wins', () => cr({ labelsAllow: new Set(['a', 'B', 'c']), labelsExclude: new Set(['b', 'C ']) }))
  kase('all excluded', () => cr({ labelsAllow: new Set(['x']), labelsExclude: new Set(['X']) }))
  kase('unicode', () => cr({ labelsAllow: new Set([' Émile ', 'İ']), labelsExclude: new Set(['ΣΑΣ']) }))
})
func('isRestricted', () => {
  kase('defaults', () => cr().isRestricted)
  kase('age', () => cr({ ageRestriction: age(0, AllowExclude.EXCLUDE) }).isRestricted)
  kase('allow', () => cr({ labelsAllow: new Set(['a']) }).isRestricted)
  kase('blank allow', () => cr({ labelsAllow: new Set([' ']) }).isRestricted)
  kase('exclude', () => cr({ labelsExclude: new Set(['a']) }).isRestricted)
  kase('allow fully excluded', () => cr({ labelsAllow: new Set(['a']), labelsExclude: new Set(['a']) }).isRestricted)
})
func('toString', () => {
  kase('defaults', () => cr().toString())
  kase('full', () => cr({ ageRestriction: age(16, AllowExclude.EXCLUDE), labelsAllow: new Set(['B', 'a']), labelsExclude: new Set(['z', 'y']) }).toString())
})
func('equals', () => {
  kase('defaults', () => eq(cr(), cr()))
  kase('normalized', () => eq(cr({ labelsAllow: new Set(['A ']) }), cr({ labelsAllow: new Set(['a']) })))
  kase('set order ignored', () => eq(cr({ labelsAllow: new Set(['a', 'b']) }), cr({ labelsAllow: new Set(['b', 'a']) })))
  kase('age differs', () => eq(cr({ ageRestriction: age(1, AllowExclude.EXCLUDE) }), cr({ ageRestriction: age(2, AllowExclude.EXCLUDE) })))
  kase('restriction differs', () => eq(cr({ ageRestriction: age(1, AllowExclude.EXCLUDE) }), cr({ ageRestriction: age(1, AllowExclude.ALLOW_ONLY) })))
  kase('same age', () => eq(cr({ ageRestriction: age(1, AllowExclude.EXCLUDE) }), cr({ ageRestriction: age(1, AllowExclude.EXCLUDE) })))
  kase('exclude differs', () => eq(cr({ labelsExclude: new Set(['a']) }), cr()))
  kase('other type', () => cr().equals('x'))
})
func('hashCode', () => {
  kase(
    'equal restrictions have equal hash',
    () =>
      cr({ ageRestriction: age(3, AllowExclude.EXCLUDE), labelsAllow: new Set(['b', 'A']), labelsExclude: new Set(['c']) }).hashCode() ===
      cr({ ageRestriction: age(3, AllowExclude.EXCLUDE), labelsAllow: new Set(['a', 'b ']), labelsExclude: new Set(['C']) }).hashCode(),
  )
})
