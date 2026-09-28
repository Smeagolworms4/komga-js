// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/web/WebMvcConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { configuration } from '../../port/spring.js'
import { CacheControl, type HandlerMethodArgumentResolver } from '../../port/spring-web.js'
import { type InterceptorRegistry, type ResourceHandlerRegistry, WebContentInterceptor, WebMvcConfigurer } from '../../port/spring-webmvc-config.js'
import { AuthorsHandlerMethodArgumentResolver } from './AuthorsHandlerMethodArgumentResolver.js'
import { DelimitedPairHandlerMethodArgumentResolver } from './DelimitedPairHandlerMethodArgumentResolver.js'
import { cachePrivate } from './Utils.js'

export class WebMvcConfiguration extends WebMvcConfigurer {
  override addResourceHandlers(registry: ResourceHandlerRegistry): void {
    if (!registry.hasMappingForPattern('/webjars/**')) {
      registry.addResourceHandler('/webjars/**').addResourceLocations('classpath:/META-INF/resources/webjars/')
    }

    if (!registry.hasMappingForPattern('/swagger-ui.html**')) {
      registry.addResourceHandler('/swagger-ui.html**').addResourceLocations('classpath:/META-INF/resources/')
    }

    registry
      .addResourceHandler(
        '/index.html',
        '/index-next.html',
        '/favicon.ico',
        '/favicon-16x16.png',
        '/favicon-32x32.png',
        '/mstile-144x144.png',
        '/apple-touch-icon.png',
        '/apple-touch-icon-180x180.png',
        '/android-chrome-192x192.png',
        '/android-chrome-512x512.png',
        '/manifest.json',
        '/layers.css',
      )
      .addResourceLocations('classpath:public/')
      .setCacheControl(CacheControl.noStore())

    for (const it of ['css', 'fonts', 'img', 'js', 'assets']) {
      registry
        .addResourceHandler(`/${it}/**`)
        .addResourceLocations(`classpath:public/${it}/`)
        // PORT: CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic() -> secondes
        .setCacheControl(CacheControl.maxAge(365 * 24 * 60 * 60, { cachePublic: true }))
    }
  }

  override addInterceptors(registry: InterceptorRegistry): void {
    const it = new WebContentInterceptor()
    it.addCacheMapping(cachePrivate, '/api/**', '/opds/**')
    registry.addInterceptor(it)
  }

  override addArgumentResolvers(resolvers: HandlerMethodArgumentResolver[]): void {
    resolvers.push(new AuthorsHandlerMethodArgumentResolver())
    resolvers.push(new DelimitedPairHandlerMethodArgumentResolver())
  }
}

configuration(WebMvcConfiguration)
