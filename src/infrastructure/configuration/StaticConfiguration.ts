// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/configuration/StaticConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ImageType } from '../image/ImageType.js'
import { type Token, configuration } from '../../port/spring.js'

export class StaticConfiguration {
  // @Bean("thumbnailType")
  thumbnailType() {
    return ImageType.JPEG
  }

  // @Bean("pdfImageType")
  pdfImageType() {
    return ImageType.JPEG
  }

  // @Bean("pdfResolution")
  pdfResolution(): number {
    return 3200 // PORT: Float
  }
}

// @Configuration
// PORT: ImageType (enum, constructeur privé) converti en jeton d'injection
configuration(StaticConfiguration, {
  beans: [
    { method: 'thumbnailType', name: 'thumbnailType', type: ImageType as unknown as Token },
    { method: 'pdfImageType', name: 'pdfImageType', type: ImageType as unknown as Token },
    // PORT: bean Float -> jeton Number, injecté par `{ type: Number, qualifier: 'pdfResolution' }`
    { method: 'pdfResolution', name: 'pdfResolution', type: Number },
  ],
})
