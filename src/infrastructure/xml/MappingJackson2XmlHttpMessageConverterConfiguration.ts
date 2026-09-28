// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/xml/MappingJackson2XmlHttpMessageConverterConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { prefixToNamespace } from '../../interfaces/api/opds/v1/dto/XmlNamespaces.js'
import { Jackson2ObjectMapperBuilder, MappingJackson2XmlHttpMessageConverter } from '../../port/jackson-xml.js'
import { configuration } from '../../port/spring.js'
import { NamespaceXmlFactory } from './NamespaceXmlFactory.js'

export class MappingJackson2XmlHttpMessageConverterConfiguration {
  mappingJackson2XmlHttpMessageConverter(builder: Jackson2ObjectMapperBuilder) {
    return new MappingJackson2XmlHttpMessageConverter(builder.createXmlMapper(true).factory(new NamespaceXmlFactory({ prefixToNamespace: prefixToNamespace })).build())
  }
}

// @Configuration
// PORT: Jackson2ObjectMapperBuilder (bean prototype de Spring Boot) -> instance neuve
configuration(MappingJackson2XmlHttpMessageConverterConfiguration, {
  beans: [
    {
      method: 'mappingJackson2XmlHttpMessageConverter',
      type: MappingJackson2XmlHttpMessageConverter,
      inject: [{ expression: () => new Jackson2ObjectMapperBuilder() }],
    },
  ],
})
