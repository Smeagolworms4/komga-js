// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/TikaConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { configuration } from '../../port/spring.js'
import { TikaConfig } from '../../port/tika.js'

export class TikaConfiguration {
  // @Bean
  tika(): TikaConfig {
    return new TikaConfig()
  }
}

// @Configuration
configuration(TikaConfiguration, {
  beans: [{ method: 'tika', type: TikaConfig }],
})
