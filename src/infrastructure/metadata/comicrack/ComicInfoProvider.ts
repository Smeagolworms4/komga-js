// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/comicrack/ComicInfoProvider.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Author } from '../../../domain/model/Author.js'
import { BCP47TagValidator } from '../../../domain/model/BCP47TagValidator.js'
import { BookMetadataPatch, BookMetadataPatchCapability } from '../../../domain/model/BookMetadataPatch.js'
import type { BookWithMedia } from '../../../domain/model/BookWithMedia.js'
import type { Library } from '../../../domain/model/Library.js'
import { MetadataPatchTarget } from '../../../domain/model/MetadataPatchTarget.js'
import { SeriesMetadata } from '../../../domain/model/SeriesMetadata.js'
import { SeriesMetadataPatch } from '../../../domain/model/SeriesMetadataPatch.js'
import { WebLink } from '../../../domain/model/WebLink.js'
import { BookAnalyzer } from '../../../domain/service/BookAnalyzer.js'
import { ISBNValidator } from '../../../port/commons-validator.js'
import { XmlMapper } from '../../../port/jackson-xml.js'
import { localDateOf } from '../../../port/java.js'
import { javaUri } from '../../../port/java-uri.js'
import { toFloatOrNull, toIntOrNull } from '../../../port/kotlin-numbers.js'
import { NoWhenBranchMatchedException, distinctSet, filterNotNull, isBlank, isNullOrBlank, mapNotNull, nn, str, trim } from '../../../port/kotlin.js'
import { KotlinLogging } from '../../../port/logging.js'
import { component } from '../../../port/spring.js'
import { BookMetadataProvider } from '../BookMetadataProvider.js'
import { SeriesMetadataFromBookProvider } from '../SeriesMetadataFromBookProvider.js'
import { ComicInfo } from './dto/ComicInfo.js'
import { Manga } from './dto/Manga.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.metadata.comicrack.ComicInfoProvider')

const COMIC_INFO = 'ComicInfo.xml'

export class ComicInfoProvider implements BookMetadataProvider, SeriesMetadataFromBookProvider {
  private readonly mapper: XmlMapper

  constructor(
    // PORT: @Autowired(required = false) avec valeur par défaut : null -> XmlMapper()
    mapper: XmlMapper | null,
    private readonly bookAnalyzer: BookAnalyzer,
    private readonly isbnValidator: ISBNValidator,
  ) {
    this.mapper = mapper ?? new XmlMapper()
  }

  readonly capabilities: ReadonlySet<BookMetadataPatchCapability> = new Set([
    BookMetadataPatchCapability.TITLE,
    BookMetadataPatchCapability.SUMMARY,
    BookMetadataPatchCapability.NUMBER,
    BookMetadataPatchCapability.NUMBER_SORT,
    BookMetadataPatchCapability.RELEASE_DATE,
    BookMetadataPatchCapability.AUTHORS,
    BookMetadataPatchCapability.READ_LISTS,
    BookMetadataPatchCapability.LINKS,
  ])

  // PORT: async (getComicInfo)
  async getBookMetadataFromBook(book: BookWithMedia): Promise<BookMetadataPatch | null> {
    const comicInfo = await this.getComicInfo(book)
    if (comicInfo !== null) {
      const releaseDate = comicInfo.year !== null ? localDateOf(nn(comicInfo.year), comicInfo.month ?? 1, comicInfo.day ?? 1) : null

      const authors: Author[] = []
      if (comicInfo.writer !== null) authors.push(...(this.splitWithRole(comicInfo.writer, 'writer') ?? []))
      if (comicInfo.penciller !== null) authors.push(...(this.splitWithRole(comicInfo.penciller, 'penciller') ?? []))
      if (comicInfo.inker !== null) authors.push(...(this.splitWithRole(comicInfo.inker, 'inker') ?? []))
      if (comicInfo.colorist !== null) authors.push(...(this.splitWithRole(comicInfo.colorist, 'colorist') ?? []))
      if (comicInfo.letterer !== null) authors.push(...(this.splitWithRole(comicInfo.letterer, 'letterer') ?? []))
      if (comicInfo.coverArtist !== null) authors.push(...(this.splitWithRole(comicInfo.coverArtist, 'cover') ?? []))
      if (comicInfo.editor !== null) authors.push(...(this.splitWithRole(comicInfo.editor, 'editor') ?? []))
      if (comicInfo.translator !== null) authors.push(...(this.splitWithRole(comicInfo.translator, 'translator') ?? []))

      const readLists: BookMetadataPatch.ReadListEntry[] = []
      if (!isNullOrBlank(comicInfo.alternateSeries)) {
        readLists.push(
          new BookMetadataPatch.ReadListEntry({
            name: nn(comicInfo.alternateSeries),
            number: comicInfo.alternateNumber !== null ? toIntOrNull(comicInfo.alternateNumber) : null,
          }),
        )
      }

      if (comicInfo.storyArc !== null) {
        const value = comicInfo.storyArc
        // get list of arcs and corresponding number, split by `,`
        const arcs = value.split(',').map((it) => (isBlank(trim(it)) ? null : trim(it)))
        const numbers = comicInfo.storyArcNumber?.split(',')?.map((it) => toIntOrNull(trim(it))) ?? null

        if (numbers !== null && numbers.length > 0) {
          // if there is associated numbers, add each valid association as a read list entry
          for (let i = 0; i < Math.min(arcs.length, numbers.length); i++) {
            const arc = arcs[i] as string | null
            const number = numbers[i] as number | null
            if (arc !== null && number !== null) readLists.push(new BookMetadataPatch.ReadListEntry({ name: arc, number: number }))
          }
        } else {
          // if there is no numbers, only use the arcs name
          readLists.push(...filterNotNull(arcs).map((it) => new BookMetadataPatch.ReadListEntry({ name: it })))
        }
      }

      const links =
        comicInfo.web !== null
          ? mapNotNull(
              comicInfo.web.split(' ').filter((it) => !isBlank(it)),
              (it) => {
                try {
                  // PORT: java.net.URI(str) et uri.host -> javaUri (analyseur de java.net.URI) ;
                  // un host null lève une NullPointerException en Kotlin (paramètre non nul de WebLink)
                  const { uri, host } = javaUri(trim(it))
                  return new WebLink({ label: nn(host), url: uri })
                } catch (e) {
                  logger.error(e as Error, () => `Could not parse Web element as valid URI: ${it}`)
                  return null
                }
              },
            )
          : null

      const tags = comicInfo.tags !== null ? mapNotNull(comicInfo.tags.split(','), (it) => (isBlank(trim(it).toLowerCase()) ? null : trim(it).toLowerCase())) : null

      const isbn = comicInfo.gtin !== null ? this.isbnValidator.validate(comicInfo.gtin) : null

      return new BookMetadataPatch({
        title: comicInfo.title !== null && isBlank(comicInfo.title) ? null : comicInfo.title,
        summary: comicInfo.summary !== null && isBlank(comicInfo.summary) ? null : comicInfo.summary,
        number: comicInfo.number !== null && isBlank(comicInfo.number) ? null : comicInfo.number,
        numberSort: comicInfo.number !== null ? toFloatOrNull(comicInfo.number) : null,
        releaseDate: releaseDate,
        authors: authors.length === 0 ? null : authors,
        readLists: readLists,
        links: links !== null && links.length === 0 ? null : links,
        tags: tags !== null && tags.length > 0 ? distinctSet(tags) : null,
        isbn: isbn,
      })
    }
    return null
  }

  readonly supportsAppendVolume = true

  // PORT: async (getComicInfo)
  async getSeriesMetadataFromBook(book: BookWithMedia, appendVolumeToTitle: boolean): Promise<SeriesMetadataPatch | null> {
    const comicInfo = await this.getComicInfo(book)
    if (comicInfo !== null) {
      let readingDirection: SeriesMetadata.ReadingDirection | null
      switch (comicInfo.manga) {
        case Manga.NO:
          readingDirection = SeriesMetadata.ReadingDirection.LEFT_TO_RIGHT
          break
        case Manga.YES_AND_RIGHT_TO_LEFT:
          readingDirection = SeriesMetadata.ReadingDirection.RIGHT_TO_LEFT
          break
        default:
          readingDirection = null
      }

      const genres = comicInfo.genre !== null ? mapNotNull(comicInfo.genre.split(','), (it) => (isBlank(trim(it)) ? null : trim(it))) : null
      const series = appendVolumeToTitle ? computeSeriesFromSeriesAndVolume(comicInfo.series, comicInfo.volume) : comicInfo.series

      return new SeriesMetadataPatch({
        title: series,
        titleSort: series,
        status: null,
        summary: null,
        readingDirection: readingDirection,
        publisher: comicInfo.publisher !== null && isBlank(comicInfo.publisher) ? null : comicInfo.publisher,
        ageRating: comicInfo.ageRating?.ageRating ?? null,
        language: comicInfo.languageISO !== null && BCP47TagValidator.isValid(nn(comicInfo.languageISO)) ? BCP47TagValidator.normalize(nn(comicInfo.languageISO)) : null,
        genres: genres !== null && genres.length > 0 ? distinctSet(genres) : null,
        totalBookCount: comicInfo.count,
        collections:
          comicInfo.seriesGroup !== null
            ? distinctSet(mapNotNull(comicInfo.seriesGroup.split(','), (it) => (isBlank(trim(it)) ? null : trim(it))))
            : new Set(),
      })
    }
    return null
  }

  shouldLibraryHandlePatch(library: Library, target: MetadataPatchTarget): boolean {
    switch (target) {
      case MetadataPatchTarget.BOOK:
        return library.importComicInfoBook
      case MetadataPatchTarget.SERIES:
        return library.importComicInfoSeries
      case MetadataPatchTarget.READLIST:
        return library.importComicInfoReadList
      case MetadataPatchTarget.COLLECTION:
        return library.importComicInfoCollection
    }
    throw new NoWhenBranchMatchedException()
  }

  // PORT: async (BookAnalyzer.getFileContent)
  private async getComicInfo(book: BookWithMedia): Promise<ComicInfo | null> {
    try {
      if (!book.media.files.some((it) => it.fileName === COMIC_INFO)) {
        logger.debug(() => `Book does not contain any ${COMIC_INFO} file: ${str(book)}`)
        return null
      }

      const fileContent = await this.bookAnalyzer.getFileContent(book, COMIC_INFO)
      return this.mapper.readValue<ComicInfo | null>(fileContent, { class: ComicInfo })
    } catch (e) {
      logger.error(e as Error, () => `Error while retrieving metadata from ${COMIC_INFO}`)
      return null
    }
  }

  private splitWithRole(self: string, role: string): Author[] | null {
    const list = mapNotNull(self.split(','), (it) => (isBlank(trim(it)) ? null : trim(it)))
    return list.length > 0 ? list.map((it) => new Author({ name: it, role: role })) : null
  }
}

export function computeSeriesFromSeriesAndVolume(series: string | null, volume: number | null): string | null {
  if (series === null || isBlank(series)) return null
  const s = series
  return s + (volume !== null ? (volume !== 1 ? ` (${volume})` : '') : '')
}

// @Service
component(ComicInfoProvider, {
  inject: [{ optional: XmlMapper }, BookAnalyzer, ISBNValidator],
  types: [BookMetadataProvider, SeriesMetadataFromBookProvider],
})
