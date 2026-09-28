// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/SeriesMetadataProvider.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Series } from '../../domain/model/Series.js'
import type { SeriesMetadataPatch } from '../../domain/model/SeriesMetadataPatch.js'
import { MetadataProvider } from './MetadataProvider.js'

// PORT: interface Kotlin -> classe abstraite (jeton d'injection de List<SeriesMetadataProvider>) ;
// les implémentations la déclarent avec `implements` et `types: [SeriesMetadataProvider]`
export abstract class SeriesMetadataProvider extends MetadataProvider {
  abstract getSeriesMetadata(series: Series): SeriesMetadataPatch | null
}
