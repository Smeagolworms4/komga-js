// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/epub/EpubMetadataProvider.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '@js-joda/timezone'
import { DateTimeFormatter, DateTimeFormatterBuilder, LocalDate, ResolverStyle } from '@js-joda/core'
import { Author } from '../../../domain/model/Author.js'
import { BCP47TagValidator } from '../../../domain/model/BCP47TagValidator.js'
import { BookMetadataPatch, BookMetadataPatchCapability } from '../../../domain/model/BookMetadataPatch.js'
import type { BookWithMedia } from '../../../domain/model/BookWithMedia.js'
import type { Library } from '../../../domain/model/Library.js'
import { MediaType } from '../../../domain/model/MediaType.js'
import { MetadataPatchTarget } from '../../../domain/model/MetadataPatchTarget.js'
import { SeriesMetadata } from '../../../domain/model/SeriesMetadata.js'
import { SeriesMetadataPatch } from '../../../domain/model/SeriesMetadataPatch.js'
import { ISBNValidator } from '../../../port/commons-validator.js'
import { Jsoup, Parser, Safelist } from '../../../port/jsoup-parser.js'
import { toFloatOrNull } from '../../../port/kotlin-numbers.js'
import { distinctSet, isBlank, mapNotNull, trim } from '../../../port/kotlin.js'
import { component } from '../../../port/spring.js'
import { getPackageFileContent } from '../../mediacontainer/epub/Epub.js'
import { BookMetadataProvider } from '../BookMetadataProvider.js'
import { SeriesMetadataFromBookProvider } from '../SeriesMetadataFromBookProvider.js'

// PORT: DateTimeFormatter.ISO_DATE_TIME de Java accepte un identifiant de fuseau entre crochets après le décalage
// (« 2021-06-20T10:00:00+05:30[Asia/Kolkata] ») ; celui de js-joda non : définition de Java reconstruite
const ISO_DATE_TIME = new DateTimeFormatterBuilder()
  .append(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
  .optionalStart()
  .appendOffsetId()
  .optionalStart()
  .appendLiteral('[')
  .parseCaseSensitive()
  .appendZoneId()
  .appendLiteral(']')
  .toFormatter(ResolverStyle.STRICT)

function ifBlankNull(s: string | null | undefined): string | null {
  return s === null || s === undefined || isBlank(s) ? null : s
}

export class EpubMetadataProvider implements BookMetadataProvider, SeriesMetadataFromBookProvider {
  private readonly relators = new Map([
    ['aut', 'writer'],
    ['clr', 'colorist'],
    ['cov', 'cover'],
    ['edt', 'editor'],
    ['art', 'penciller'],
    ['ill', 'penciller'],
    ['trl', 'translator'],
  ])

  constructor(private readonly isbnValidator: ISBNValidator) {}

  readonly capabilities: ReadonlySet<BookMetadataPatchCapability> = new Set([
    BookMetadataPatchCapability.TITLE,
    BookMetadataPatchCapability.SUMMARY,
    BookMetadataPatchCapability.RELEASE_DATE,
    BookMetadataPatchCapability.AUTHORS,
    BookMetadataPatchCapability.ISBN,
  ])

  getBookMetadataFromBook(book: BookWithMedia): BookMetadataPatch | null {
    if (book.media.mediaType !== MediaType.EPUB.type) return null
    const packageFile = getPackageFileContent(book.book.path)
    if (packageFile !== null) {
      const opf = Jsoup.parse(packageFile, '', Parser.xmlParser())

      const title = ifBlankNull(opf.selectFirst('*|metadata > *|title')?.text())
      const descriptionText = opf.selectFirst('*|metadata > *|description')?.text()
      const description = ifBlankNull(descriptionText !== undefined ? Jsoup.clean(descriptionText, Safelist.none()) : null)
      const dateText = opf.selectFirst('*|metadata > *|date')?.text()
      const date = dateText !== undefined ? this.parseDate(dateText) : null

      const authorRoles = new Map(
        opf.select('*|metadata > *|meta[property=role][scheme=marc:relators]').map((it) => {
          const refines = it.attr('refines')
          return [refines.startsWith('#') ? refines.substring(1) : refines, it.text()] as const
        }),
      )
      const authorsList = mapNotNull(opf.select('*|metadata > *|creator'), (el) => {
        const name = trim(el.text())
        if (isBlank(name)) {
          return null
        } else {
          const opfRole = ifBlankNull(el.attr('opf:role'))
          const id = ifBlankNull(el.attr('id'))
          const refineRole = ifBlankNull(id !== null ? authorRoles.get(id) : null)
          const role = opfRole ?? refineRole
          return new Author({ name: name, role: (role !== null ? this.relators.get(role) : undefined) ?? 'writer' })
        }
      })
      const authors = authorsList.length === 0 ? null : authorsList

      let isbn: string | null = null
      for (const it of opf.select('*|metadata > *|identifier')) {
        const lower = it.text().toLowerCase()
        const v = this.isbnValidator.validate(lower.startsWith('isbn:') ? lower.substring('isbn:'.length) : lower)
        if (v !== null) {
          isbn = v
          break
        }
      }

      const collectionId = opf.selectFirst('*|metadata > *|meta[property=belongs-to-collection]')?.attr('id')
      const seriesIndex =
        collectionId !== undefined ? (opf.selectFirst(`*|metadata > *|meta[refines=#${collectionId}][property=group-position]`)?.text() ?? null) : null

      return new BookMetadataPatch({
        title: title,
        summary: description,
        releaseDate: date,
        authors: authors,
        isbn: isbn,
        number: ifBlankNull(seriesIndex),
        numberSort: seriesIndex !== null ? toFloatOrNull(seriesIndex) : null,
      })
    }
    return null
  }

  readonly supportsAppendVolume = false

  getSeriesMetadataFromBook(book: BookWithMedia, appendVolumeToTitle: boolean): SeriesMetadataPatch | null {
    void appendVolumeToTitle
    if (book.media.mediaType !== MediaType.EPUB.type) return null
    const packageFile = getPackageFileContent(book.book.path)
    if (packageFile !== null) {
      const opf = Jsoup.parse(packageFile, '', Parser.xmlParser())

      const series = ifBlankNull(opf.selectFirst('*|metadata > *|meta[property=belongs-to-collection]')?.text())
      const publisher = ifBlankNull(opf.selectFirst('*|metadata > *|publisher')?.text())
      const language = ifBlankNull(opf.selectFirst('*|metadata > *|language')?.text())
      const genresSet = distinctSet(mapNotNull(opf.select('*|metadata > *|subject'), (it) => ifBlankNull(trim(it.text()))))
      const genres = genresSet.size === 0 ? null : genresSet

      const directionAttr = opf.selectFirst('*|spine')?.attr('page-progression-direction')
      let direction: SeriesMetadata.ReadingDirection | null = null
      if (directionAttr !== undefined) {
        switch (directionAttr) {
          case 'rtl':
            direction = SeriesMetadata.ReadingDirection.RIGHT_TO_LEFT
            break
          case 'ltr':
            direction = SeriesMetadata.ReadingDirection.LEFT_TO_RIGHT
            break
          default:
            direction = null
        }
      }

      return new SeriesMetadataPatch({
        title: series,
        titleSort: series,
        status: null,
        readingDirection: direction,
        publisher: publisher,
        ageRating: null,
        summary: null,
        language: language !== null && BCP47TagValidator.isValid(language) ? BCP47TagValidator.normalize(language) : null,
        genres: genres,
        totalBookCount: null,
        collections: new Set(),
      })
    }
    return null
  }

  shouldLibraryHandlePatch(library: Library, target: MetadataPatchTarget): boolean {
    switch (target) {
      case MetadataPatchTarget.BOOK:
        return library.importEpubBook
      case MetadataPatchTarget.SERIES:
        return library.importEpubSeries
      default:
        return false
    }
  }

  private parseDate(date: string): LocalDate | null {
    try {
      return LocalDate.parse(date, DateTimeFormatter.ISO_DATE)
    } catch {
      try {
        return LocalDate.parse(date, DateTimeFormatter.ISO_LOCAL_DATE)
      } catch {
        try {
          return LocalDate.parse(date, ISO_DATE_TIME)
        } catch {
          return null
        }
      }
    }
  }
}

// @Service
component(EpubMetadataProvider, { inject: [ISBNValidator], types: [BookMetadataProvider, SeriesMetadataFromBookProvider] })
