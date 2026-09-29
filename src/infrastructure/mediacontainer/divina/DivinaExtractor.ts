// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/divina/DivinaExtractor.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { MediaContainerEntry } from '../../../domain/model/MediaContainerEntry.js'

// PORT: interface Kotlin -> classe abstraite (jeton d'injection)
export abstract class DivinaExtractor {
  abstract mediaTypes(): string[]

  // @Throws(MediaUnsupportedException::class)
  // PORT: async (lectures sur le pool de libuv et passages coopératifs, voir PORTING.md « Architecture d'exécution »)
  abstract getEntries(path: string, analyzeDimensions: boolean): Promise<MediaContainerEntry[]>

  // PORT: async
  abstract getEntryStream(path: string, entryName: string): Promise<Uint8Array>
}
