// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/SearchOperatorOracleTest.kt
import { SearchOperator } from '../../../../src/domain/model/SearchOperator.js'
import { distinctSet, eq } from '../../../../src/port/kotlin.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/SearchOperator')

func('equals@256', () => {
  kase('same instance', () => {
    const it = new SearchOperator.IsNullT<number>()
    return eq(it, it)
  })
  kase('other instance', () => eq(new SearchOperator.IsNullT<number>(), new SearchOperator.IsNullT<number>()))
  kase('other type parameter', () => new SearchOperator.IsNullT<number>().equals(new SearchOperator.IsNullT<string>()))
  kase('is not null', () => new SearchOperator.IsNullT<number>().equals(new SearchOperator.IsNotNullT<number>()))
  kase('date is null object', () => new SearchOperator.IsNullT<number>().equals(SearchOperator.IsNull))
  kase('null', () => new SearchOperator.IsNullT<number>().equals(null))
  kase('in a list', () => [new SearchOperator.IsNotNullT<number>(), new SearchOperator.IsNullT<number>()].findIndex((it) => eq(it, new SearchOperator.IsNullT<string>())))
})
func('hashCode@262', () => {
  kase('equal instances', () => new SearchOperator.IsNullT<number>().hashCode() === new SearchOperator.IsNullT<string>().hashCode())
  kase('differs from is not null', () => new SearchOperator.IsNullT<number>().hashCode() === new SearchOperator.IsNotNullT<number>().hashCode())
  kase('set of instances', () => distinctSet([new SearchOperator.IsNullT<number>(), new SearchOperator.IsNullT<number>()]).size)
})
func('equals@270', () => {
  kase('same instance', () => {
    const it = new SearchOperator.IsNotNullT<number>()
    return eq(it, it)
  })
  kase('other instance', () => eq(new SearchOperator.IsNotNullT<number>(), new SearchOperator.IsNotNullT<number>()))
  kase('other type parameter', () => new SearchOperator.IsNotNullT<number>().equals(new SearchOperator.IsNotNullT<string>()))
  kase('is null', () => new SearchOperator.IsNotNullT<number>().equals(new SearchOperator.IsNullT<number>()))
  kase('date is not null object', () => new SearchOperator.IsNotNullT<number>().equals(SearchOperator.IsNotNull))
  kase('null', () => new SearchOperator.IsNotNullT<number>().equals(null))
})
func('hashCode@276', () => {
  kase('equal instances', () => new SearchOperator.IsNotNullT<number>().hashCode() === new SearchOperator.IsNotNullT<number>().hashCode())
  kase('set of instances', () =>
    distinctSet<unknown>([new SearchOperator.IsNotNullT<number>(), new SearchOperator.IsNotNullT<string>(), new SearchOperator.IsNullT<number>()]).size,
  )
})
