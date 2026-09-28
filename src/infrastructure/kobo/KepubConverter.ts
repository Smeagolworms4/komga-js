// TEMPORAIRE (agent mediacontainer) : bouchon en attendant le portage de infrastructure/kobo/KepubConverter.kt.
// Seule la surface utilisée par EpubExtractor est présente ; kepubify est considéré indisponible.
import type { Book } from '../../domain/model/Book.js'
import { IllegalStateException } from '../../port/kotlin.js'

export class KepubConverter {
  isAvailable = false

  convertEpubToKepubWithoutChecks(_book: Book, _destinationDir: string | null = null): string | null {
    throw new IllegalStateException('Kepub conversion is not available, kepubify path may not be set, or may be invalid')
  }
}
