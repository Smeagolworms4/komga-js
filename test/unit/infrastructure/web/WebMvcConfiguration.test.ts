// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/web/WebMvcConfigurationOracleTest.kt
import { WebMvcConfiguration } from '../../../../src/infrastructure/web/WebMvcConfiguration.js'
import type { HandlerMethodArgumentResolver } from '../../../../src/port/spring-web.js'
import { type HandlerInterceptor, InterceptorRegistry, ResourceHandlerRegistry, WebContentInterceptor } from '../../../../src/port/spring-webmvc-config.js'
import { oracle } from '../../oracle.js'
import { request, response } from '../../web-oracle.js'

const { func, kase } = oracle('infrastructure/web/WebMvcConfiguration')

const config = new WebMvcConfiguration()

const describe = (registry: ResourceHandlerRegistry) => registry.registrations.map((it) => [it.pathPatterns, it.locations, it.cacheControl])

function cacheControl(uri: string): unknown[] {
  const registry = new InterceptorRegistry()
  config.addInterceptors(registry)
  const res = response()
  const result = (registry.getInterceptors()[0] as HandlerInterceptor).preHandle!(request({ uri }), res, {})
  return [result, res.getHeader('Cache-Control')]
}

func('addResourceHandlers', () => {
  kase('empty registry', () => {
    const registry = new ResourceHandlerRegistry()
    config.addResourceHandlers(registry)
    return describe(registry)
  })
  kase('webjars already mapped', () => {
    const registry = new ResourceHandlerRegistry()
    registry.addResourceHandler('/webjars/**').addResourceLocations('classpath:/other/')
    config.addResourceHandlers(registry)
    return describe(registry)
  })
  kase('swagger already mapped', () => {
    const registry = new ResourceHandlerRegistry()
    registry.addResourceHandler('/swagger-ui.html**')
    config.addResourceHandlers(registry)
    return describe(registry).length
  })
  kase('mappings', () => {
    const registry = new ResourceHandlerRegistry()
    config.addResourceHandlers(registry)
    return ['/webjars/**', '/swagger-ui.html**', '/index.html', '/css/**', '/assets/**', '/js/*', '/other/**'].map((it) => registry.hasMappingForPattern(it))
  })
})

func('addInterceptors', () => {
  kase('interceptors', () => {
    const registry = new InterceptorRegistry()
    config.addInterceptors(registry)
    return registry.getInterceptors().map((it) => it instanceof WebContentInterceptor)
  })
  for (const uri of ['/api/v1/books', '/api', '/api/', '/opds/v1.2/catalog', '/opds', '/kobo/k/v1/library/sync', '/', '/index.html', '/apiv1', '/sse/v1/events'])
    kase(`cache control ${uri}`, () => cacheControl(uri))
})

func('addArgumentResolvers', () => {
  kase('resolvers', () => {
    const resolvers: HandlerMethodArgumentResolver[] = []
    config.addArgumentResolvers(resolvers)
    return resolvers.map((it) => it.constructor.name)
  })
})
