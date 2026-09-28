// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/MetadataAggregator.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { BookMetadata } from '../model/BookMetadata.js'
import { BookMetadataAggregation } from '../model/BookMetadataAggregation.js'
import { isNotBlank, distinctBy, mapNotNull, minByOrNull, sortedBy } from '../../port/kotlin.js'
import { component } from '../../port/spring.js'

export class MetadataAggregator {
  aggregate(metadatas: Iterable<BookMetadata>): BookMetadataAggregation {
    const authors = distinctBy(
      [...metadatas].flatMap((it) => it.authors),
      (it) => `${it.role}__${it.name}`,
    )
    const tags = new Set([...metadatas].flatMap((it) => [...it.tags]))
    const found = sortedBy(metadatas, (it) => it.numberSort).find((it) => isNotBlank(it.summary))
    const [summary, summaryNumber] = found !== undefined ? [found.summary, found.number] : ['', '']
    const releaseDate = minByOrNull(
      mapNotNull(metadatas, (it) => it.releaseDate),
      (it) => it,
    )

    return new BookMetadataAggregation({ authors: authors, tags: tags, releaseDate: releaseDate, summary: summary, summaryNumber: summaryNumber })
  }
}

// @Service
component(MetadataAggregator)
