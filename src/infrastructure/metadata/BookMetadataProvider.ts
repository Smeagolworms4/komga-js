// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/BookMetadataProvider.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { BookMetadataPatch, BookMetadataPatchCapability } from '../../domain/model/BookMetadataPatch.js'
import type { BookWithMedia } from '../../domain/model/BookWithMedia.js'
import { MetadataProvider } from './MetadataProvider.js'

// PORT: interface Kotlin -> classe abstraite (jeton d'injection de List<BookMetadataProvider>) ;
// les implémentations la déclarent avec `implements` et `types: [BookMetadataProvider]`
export abstract class BookMetadataProvider extends MetadataProvider {
  abstract readonly capabilities: ReadonlySet<BookMetadataPatchCapability>

  // PORT: async possible (IsbnBarcodeProvider décode les images avec sharp) : les appelants font `await`
  abstract getBookMetadataFromBook(book: BookWithMedia): BookMetadataPatch | null | Promise<BookMetadataPatch | null>
}
