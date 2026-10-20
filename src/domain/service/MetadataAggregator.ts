// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/MetadataAggregator.kt@a9b59dbee73424d7f2e186b24b0905913f816709
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
    const notableEntities = distinctBy(
      [...metadatas].flatMap((it) => it.notableEntities),
      (it) => `${it.kind}__${it.name}`,
    )
    const tags = new Set([...metadatas].flatMap((it) => [...it.tags]))
    const found = sortedBy(metadatas, (it) => it.numberSort).find((it) => isNotBlank(it.summary))
    const [summary, summaryNumber] = found !== undefined ? [found.summary, found.number] : ['', '']
    const releaseDate = minByOrNull(
      mapNotNull(metadatas, (it) => it.releaseDate),
      (it) => it,
    )

    return new BookMetadataAggregation({ authors: authors, notableEntities: notableEntities, tags: tags, releaseDate: releaseDate, summary: summary, summaryNumber: summaryNumber })
  }
}

// @Service
component(MetadataAggregator)
