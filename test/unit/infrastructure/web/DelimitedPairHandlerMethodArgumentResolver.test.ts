// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/web/DelimitedPairHandlerMethodArgumentResolverOracleTest.kt
import { DelimitedPairHandlerMethodArgumentResolver } from '../../../../src/infrastructure/web/DelimitedPairHandlerMethodArgumentResolver.js'
import { oracle } from '../../oracle.js'
import { request } from '../../web-oracle.js'

const { func, kase } = oracle('infrastructure/web/DelimitedPairHandlerMethodArgumentResolver')

const resolver = new DelimitedPairHandlerMethodArgumentResolver()
// PORT: paramètres de AuthorsSample.handler(@Authors authors, @DelimitedPair("search") pair, plain)
const params = [
  { annotation: 'Authors', name: 'authors' },
  { annotation: 'DelimitedPair', name: 'pair' },
  { annotation: '', name: 'plain' },
]

const resolve = (query: string | null) => resolver.resolveArgument('search', request({ query }))

func('supportsParameter', () => {
  kase('@Authors', () => resolver.supportsParameter(params[0]!))
  kase('@DelimitedPair', () => resolver.supportsParameter(params[1]!))
  kase('no annotation', () => resolver.supportsParameter(params[2]!))
})

func('resolveArgument', () => {
  kase('no parameter', () => resolve(null))
  kase('other parameter', () => resolve('author=a,b'))
  kase('single empty', () => resolve('search='))
  kase('single blank', () => resolve('search=%20'))
  kase('pair', () => resolve('search=abc,TITLE'))
  kase('first value only', () => resolve('search=a,b&search=c,d'))
  kase('first empty, second set', () => resolve('search=&search=c,d'))
  kase('without delimiter', () => resolve('search=abc'))
})

func('parseParameterIntoPairs', () => {
  kase('last delimiter splits', () => resolve('search=a,b,c'))
  kase('trailing delimiter', () => resolve('search=abc,'))
  kase('leading delimiter', () => resolve('search=,abc'))
  kase('only delimiter', () => resolve('search=,'))
  kase('spaces kept', () => resolve('search=%20a%20,%20b%20'))
  kase('regex', () => resolve('search=%5E(a%7Cb)%2C%24,title'))
})
