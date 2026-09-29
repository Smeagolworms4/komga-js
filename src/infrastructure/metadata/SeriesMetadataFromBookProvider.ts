// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/SeriesMetadataFromBookProvider.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { BookWithMedia } from '../../domain/model/BookWithMedia.js'
import type { SeriesMetadataPatch } from '../../domain/model/SeriesMetadataPatch.js'
import { MetadataProvider } from './MetadataProvider.js'

// PORT: interface Kotlin -> classe abstraite (jeton d'injection de List<SeriesMetadataFromBookProvider>) ;
// les implémentations la déclarent avec `implements` et `types: [SeriesMetadataFromBookProvider]`
export abstract class SeriesMetadataFromBookProvider extends MetadataProvider {
  abstract readonly supportsAppendVolume: boolean

  // PORT: async possible (ComicInfoProvider lit ComicInfo.xml sur le pool de libuv) : les appelants font `await`
  abstract getSeriesMetadataFromBook(book: BookWithMedia, appendVolumeToTitle: boolean): SeriesMetadataPatch | null | Promise<SeriesMetadataPatch | null>
}
