// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/TransientBookLifecycle.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { BookMetadataPatchCapability } from '../model/BookMetadataPatch.js'
import { Media } from '../model/Media.js'
import { MediaProfile } from '../model/MediaProfile.js'
import { PathContainedInPath } from '../model/Exceptions.js'
import { SearchCondition } from '../model/SearchCondition.js'
import { SearchContext } from '../model/SearchContext.js'
import { SearchOperator } from '../model/SearchOperator.js'
import { TransientBook, toBookWithMedia } from '../model/TransientBook.js'
import { TypedBytes } from '../model/TypedBytes.js'
import { LibraryRepository } from '../persistence/LibraryRepository.js'
import { SeriesRepository } from '../persistence/SeriesRepository.js'
import { TransientBookRepository } from '../persistence/TransientBookRepository.js'
import { ImageType } from '../../infrastructure/image/ImageType.js'
import { BookMetadataProvider } from '../../infrastructure/metadata/BookMetadataProvider.js'
import { SeriesMetadataFromBookProvider } from '../../infrastructure/metadata/SeriesMetadataFromBookProvider.js'
import { filterNotNull, isBlank, nn } from '../../port/kotlin.js'
import { pathStartsWith } from '../../port/java.js'
import { Pageable } from '../../port/spring-data.js'
import { type Token, component } from '../../port/spring.js'
import { BookAnalyzer } from './BookAnalyzer.js'
import { FileSystemScanner } from './FileSystemScanner.js'

export class TransientBookLifecycle {
  readonly bookMetadataProviders: BookMetadataProvider[]

  constructor(
    private readonly transientBookRepository: TransientBookRepository,
    private readonly bookAnalyzer: BookAnalyzer,
    private readonly fileSystemScanner: FileSystemScanner,
    private readonly libraryRepository: LibraryRepository,
    // @Qualifier("pdfImageType")
    private readonly pdfImageType: ImageType,
    private readonly seriesRepository: SeriesRepository,
    private readonly seriesMetadataProviders: SeriesMetadataFromBookProvider[],
    bookMetadataProviders: BookMetadataProvider[],
  ) {
    this.bookMetadataProviders = bookMetadataProviders.filter((it) => it.capabilities.has(BookMetadataPatchCapability.NUMBER_SORT))
  }

  // PORT: async (FileSystemScanner.scanRootFolder)
  async scanAndPersist(filePath: string): Promise<TransientBook[]> {
    const folderToScan = filePath

    this.libraryRepository.findAll().forEach((library) => {
      if (pathStartsWith(folderToScan, library.path)) throw new PathContainedInPath('Cannot scan folder that is part of an existing library', 'ERR_1017')
    })

    const books = [...(await this.fileSystemScanner.scanRootFolder(folderToScan)).series.values()]
      .flat()
      .map((it) => new TransientBook({ book: it, media: new Media() }))

    this.transientBookRepository.save(books)

    return books
  }

  // PORT: async (getMetadata)
  async analyzeAndPersist(transientBook: TransientBook): Promise<TransientBook> {
    const media = await this.bookAnalyzer.analyze(transientBook.book, true)
    const [seriesId, number] = await this.getMetadata(transientBook.copy({ media: media }))

    const updated = transientBook.copy({ media: media, metadata: new TransientBook.Metadata({ number: number, seriesId: seriesId }) })
    this.transientBookRepository.save(updated)

    return updated
  }

  // PORT: async (BookMetadataProvider.getBookMetadataFromBook peut être asynchrone) ; Pair -> tuple
  async getMetadata(transientBook: TransientBook): Promise<[string | null, number | null]> {
    const bookWithMedia = toBookWithMedia(transientBook)
    let number: number | null = null
    for (const it of this.bookMetadataProviders) {
      const n = (await it.getBookMetadataFromBook(bookWithMedia))?.numberSort ?? null
      if (n !== null) {
        number = n
        break
      }
    }
    // PORT: flatMap -> boucle (getSeriesMetadataFromBook peut être asynchrone)
    const seriesNames: (string | null)[] = []
    for (const it of this.seriesMetadataProviders) {
      const list: (string | null)[] = []
      if (it.supportsAppendVolume) list.push(ifBlankNull((await it.getSeriesMetadataFromBook(bookWithMedia, true))?.title ?? null))
      list.push(ifBlankNull((await it.getSeriesMetadataFromBook(bookWithMedia, false))?.title ?? null))
      seriesNames.push(...list)
    }
    const seriesNamesFromMetadata = filterNotNull(seriesNames)

    let series
    if (seriesNamesFromMetadata.length > 0) {
      const exactSearch = new SearchCondition.AnyOfSeries({
        conditions: seriesNamesFromMetadata.map((it) => new SearchCondition.Title({ operator: new SearchOperator.Is({ value: it }) })),
      })
      const exactMatches = this.seriesRepository.findAll(exactSearch, SearchContext.ofAnonymousUser(), Pageable.unpaged())
      if (!exactMatches.isEmpty()) {
        series = nn(exactMatches.content[0])
      } else {
        const containsSearch = new SearchCondition.AnyOfSeries({
          conditions: seriesNamesFromMetadata.map((it) => new SearchCondition.Title({ operator: new SearchOperator.Contains({ value: it }) })),
        })
        series = this.seriesRepository.findAll(containsSearch, SearchContext.ofAnonymousUser(), Pageable.unpaged()).content[0] ?? null
      }
    } else {
      series = null
    }

    return [series?.id ?? null, number]
  }

  // @Throws(MediaNotReadyException::class, IndexOutOfBoundsException::class)
  // PORT: async (BookAnalyzer.getPageContent)
  async getBookPage(transientBook: TransientBook, number: number): Promise<TypedBytes> {
    const pageContent = await this.bookAnalyzer.getPageContent(toBookWithMedia(transientBook), number)
    const pageMediaType = transientBook.media.profile === MediaProfile.PDF ? this.pdfImageType.mediaType : nn(transientBook.media.pages[number - 1]).mediaType

    return new TypedBytes({ bytes: pageContent, mediaType: pageMediaType })
  }
}

/** `?.ifBlank { null }` */
function ifBlankNull(s: string | null): string | null {
  return s === null || isBlank(s) ? null : s
}

// @Service
component(TransientBookLifecycle, {
  inject: [
    TransientBookRepository,
    BookAnalyzer,
    FileSystemScanner,
    LibraryRepository,
    // PORT: constructeur privé de l'enum : conversion explicite en jeton d'injection
    { type: ImageType as unknown as Token, qualifier: 'pdfImageType' },
    SeriesRepository,
    { list: SeriesMetadataFromBookProvider },
    { list: BookMetadataProvider },
  ],
})
