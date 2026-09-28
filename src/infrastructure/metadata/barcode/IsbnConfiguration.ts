// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/barcode/IsbnConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ISBNValidator } from '../../../port/commons-validator.js'
import { configuration } from '../../../port/spring.js'

export class IsbnConfiguration {
  // @Bean
  isbnValidator() {
    return new ISBNValidator(true)
  }
}

// @Configuration
configuration(IsbnConfiguration, {
  beans: [{ method: 'isbnValidator', type: ISBNValidator }],
})
