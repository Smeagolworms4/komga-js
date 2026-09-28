// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/web/AuthorsHandlerMethodArgumentResolverOracleTest.kt
import { AuthorsHandlerMethodArgumentResolver } from '../../../../src/infrastructure/web/AuthorsHandlerMethodArgumentResolver.js'
import { oracle } from '../../oracle.js'
import { request } from '../../web-oracle.js'

const { func, kase } = oracle('infrastructure/web/AuthorsHandlerMethodArgumentResolver')

const resolver = new AuthorsHandlerMethodArgumentResolver()
// PORT: paramètres de AuthorsSample.handler(@Authors authors, @DelimitedPair("search") pair, plain)
const params = [
  { annotation: 'Authors', name: 'authors' },
  { annotation: 'DelimitedPair', name: 'pair' },
  { annotation: '', name: 'plain' },
]

const resolve = (query: string | null) => resolver.resolveArgument('authors', request({ query }))

func('supportsParameter', () => {
  kase('@Authors', () => resolver.supportsParameter(params[0]!))
  kase('@DelimitedPair', () => resolver.supportsParameter(params[1]!))
  kase('no annotation', () => resolver.supportsParameter(params[2]!))
})

func('resolveArgument', () => {
  kase('no parameter', () => resolve(null))
  kase('other parameter', () => resolve('authors=a,b'))
  kase('single empty', () => resolve('author='))
  kase('single blank', () => resolve('author=%20%20'))
  kase('single', () => resolve('author=john,writer'))
  kase('several', () => resolve('author=john,writer&author=jane,penciller'))
  kase('empty among several', () => resolve('author=&author=jane,penciller'))
  kase('without delimiter', () => resolve('author=john'))
  kase('encoded comma', () => resolve('author=john%2Cwriter'))
})

func('parseParameterIntoAuthors', () => {
  kase('last delimiter splits', () => resolve('author=Doe,%20John,writer'))
  kase('trailing delimiter', () => resolve('author=john,'))
  kase('leading delimiter', () => resolve('author=,writer'))
  kase('only delimiter', () => resolve('author=,'))
  kase('role case and spaces', () => resolve('author=%20John%20Doe%20,%20WRITER%20'))
  kase('unicode', () => resolve('author=%C3%A9mile%20%E6%BC%AB,%C3%89diteur'))
  kase('mixed', () => resolve('author=a&author=b,c&author=d,e,f'))
})
