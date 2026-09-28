// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/divina/DivinaExtractor.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { MediaContainerEntry } from '../../../domain/model/MediaContainerEntry.js'

// PORT: interface Kotlin -> classe abstraite (jeton d'injection)
export abstract class DivinaExtractor {
  abstract mediaTypes(): string[]

  // @Throws(MediaUnsupportedException::class)
  abstract getEntries(path: string, analyzeDimensions: boolean): MediaContainerEntry[]

  abstract getEntryStream(path: string, entryName: string): Uint8Array
}
