// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/CorsConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KomgaProperties } from '../configuration/KomgaProperties.js'
import { CorsConfiguration as SpringCorsConfiguration, UrlBasedCorsConfigurationSource } from '../../port/spring-web-cors.js'
import { type Environment, configuration } from '../../port/spring.js'

export class CorsConfiguration {
  // @Conditional(CorsAllowedOriginsPresent::class)
  corsConfigurationSource(sessionHeaderName: string, komgaProperties: KomgaProperties): UrlBasedCorsConfigurationSource {
    const source = new UrlBasedCorsConfigurationSource()
    // PORT: org.springframework.web.cors.CorsConfiguration (même nom que cette classe) importée sous le nom SpringCorsConfiguration
    const config = new SpringCorsConfiguration().applyPermitDefaultValues()
    config.allowedOrigins = komgaProperties.cors.allowedOrigins
    // PORT: HttpMethod.values().map { it.name() }
    config.allowedMethods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE'].map((it) => it)
    config.allowCredentials = true
    config.addExposedHeader('Content-Disposition')
    config.addExposedHeader(sessionHeaderName)
    source.registerCorsConfiguration('/**', config)
    return source
  }
}

export namespace CorsConfiguration {
  // PORT: SpringBootCondition -> fonction de l'Environment
  export class CorsAllowedOriginsPresent {
    getMatchOutcome(environment: Environment): { match: boolean; message: string } {
      // Binder.bind("komga.cors.allowed-origins", List) : valeur séparée par des virgules ou liste indexée
      const raw = environment.getProperty('komga.cors.allowed-origins')
      const list =
        raw !== null
          ? raw
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
          : environment.keysUnder('komga.cors.allowed-origins')
      const defined = list.length > 0
      return { match: defined, message: 'Cors allowed-origins present' }
    }
  }
}

// @Configuration
configuration(CorsConfiguration, {
  beans: [
    {
      method: 'corsConfigurationSource',
      type: UrlBasedCorsConfigurationSource,
      inject: [{ expression: (ctx) => ctx.getBean('sessionHeaderName') }, KomgaProperties],
      condition: (env) => new CorsConfiguration.CorsAllowedOriginsPresent().getMatchOutcome(env).match,
    },
  ],
})
