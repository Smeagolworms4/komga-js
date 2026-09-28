// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/xml/MappingJackson2XmlHttpMessageConverterConfigurationOracleTest.kt
import { LocalDateTime, ZoneOffset, ZonedDateTime } from '@js-joda/core'
import { MappingJackson2XmlHttpMessageConverterConfiguration } from '../../../../src/infrastructure/xml/MappingJackson2XmlHttpMessageConverterConfiguration.js'
import { OpdsAuthor } from '../../../../src/interfaces/api/opds/v1/dto/OpdsAuthor.js'
import { OpdsFeedAcquisition } from '../../../../src/interfaces/api/opds/v1/dto/OpdsFeed.js'
import { OpdsLinkPageStreaming, OpdsLinkSearch } from '../../../../src/interfaces/api/opds/v1/dto/OpdsLink.js'
import { Jackson2ObjectMapperBuilder } from '../../../../src/port/jackson-xml.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/xml/MappingJackson2XmlHttpMessageConverterConfiguration')

const converter = new MappingJackson2XmlHttpMessageConverterConfiguration().mappingJackson2XmlHttpMessageConverter(new Jackson2ObjectMapperBuilder())

func('mappingJackson2XmlHttpMessageConverter', () => {
  kase('mapper factory', () => converter.objectMapper.factory.constructor.name)
  kase('feed with page streaming', () =>
    converter.objectMapper.writeValueAsString(
      new OpdsFeedAcquisition({
        id: 'id',
        title: 'Titre é',
        updated: ZonedDateTime.of(2022, 12, 31, 23, 59, 59, 0, ZoneOffset.UTC),
        author: new OpdsAuthor({ name: 'Komga' }),
        links: [
          new OpdsLinkSearch({ href: '/search' }),
          new OpdsLinkPageStreaming({ mediaType: 'image/webp', href: '/p/{pageNumber}', count: 5, lastRead: 0, lastReadDate: LocalDateTime.of(2021, 3, 28, 2, 30) }),
        ],
        entries: [],
      }),
    ),
  )
})
