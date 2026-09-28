// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/WebPubGenerator.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { BookPage } from '../../domain/model/BookPage.js'
import type { EpubTocEntry } from '../../domain/model/EpubTocEntry.js'
import type { Media } from '../../domain/model/Media.js'
import { MediaExtensionEpub, ProxyExtension } from '../../domain/model/MediaExtension.js'
import { MediaFile } from '../../domain/model/MediaFile.js'
import { MediaProfile } from '../../domain/model/MediaProfile.js'
import { MediaType as KomgaMediaType } from '../../domain/model/MediaType.js'
import { SeriesMetadata } from '../../domain/model/SeriesMetadata.js'
import { MediaRepository } from '../../domain/persistence/MediaRepository.js'
import { BookAnalyzer } from '../../domain/service/BookAnalyzer.js'
import { ImageConverter } from '../../infrastructure/image/ImageConverter.js'
import { ImageType } from '../../infrastructure/image/ImageType.js'
import { toZonedDateTime } from '../../language/LanguageUtils.js'
import { groupBy, isNotBlank } from '../../port/kotlin.js'
import { type Token, component } from '../../port/spring.js'
import { MediaType } from '../../port/spring-web.js'
import { ServletUriComponentsBuilder, type UriComponentsBuilder } from '../../port/spring-web-uri.js'
import {
  MEDIATYPE_DIVINA_JSON,
  MEDIATYPE_DIVINA_JSON_VALUE,
  MEDIATYPE_WEBPUB_JSON,
  MEDIATYPE_WEBPUB_JSON_VALUE,
  PROFILE_DIVINA,
  PROFILE_EPUB,
  PROFILE_PDF,
} from './dto/Constants.js'
import { OpdsLinkRel } from './dto/OpdsLinkRel.js'
import { WPBelongsToDto, WPContributorDto, WPLinkDto, WPMetadataDto, WPPublicationDto, WPReadingProgressionDto } from './dto/WepPub.js'
import type { AuthorDto } from './rest/dto/AuthorDto.js'
import type { BookDto } from './rest/dto/BookDto.js'

export class WebPubGenerator {
  protected readonly pathSegments: string[] = ['api', 'v1']

  constructor(
    // @Qualifier("thumbnailType")
    private readonly thumbnailType: ImageType,
    private readonly imageConverter: ImageConverter,
    private readonly bookAnalyzer: BookAnalyzer,
    private readonly mediaRepository: MediaRepository,
  ) {}

  protected toBasePublicationDto(bookDto: BookDto): WPPublicationDto {
    const uriBuilder = ServletUriComponentsBuilder.fromCurrentContextPath().pathSegment(...this.pathSegments)
    return new WPPublicationDto({
      mediaType: this.getDefaultMediaType(),
      context: 'https://readium.org/webpub-manifest/context.jsonld',
      metadata: this.withAuthors(this.toWPMetadataDto(bookDto), bookDto.metadata.authors),
      links: this.toWPLinkDtos(bookDto, uriBuilder),
    })
  }

  // PORT: MediaType -> chaîne
  protected getDefaultMediaType(): string {
    return MEDIATYPE_WEBPUB_JSON
  }

  protected buildThumbnailLinkDtos(bookId: string): WPLinkDto[] {
    return [
      new WPLinkDto({
        href: ServletUriComponentsBuilder.fromCurrentContextPath()
          .pathSegment(...this.pathSegments)
          .path(`books/${bookId}/thumbnail`)
          .toUriString(),
        type: this.thumbnailType.mediaType,
        properties: this.getExtraLinkProperties(),
      }),
    ]
  }

  toManifestDivina(bookDto: BookDto, media: Media, seriesMetadata: SeriesMetadata): WPPublicationDto {
    const uriBuilder = ServletUriComponentsBuilder.fromCurrentContextPath().pathSegment(...this.pathSegments)
    const it = this.toBasePublicationDto(bookDto)
    const pages = media.profile === MediaProfile.PDF ? this.bookAnalyzer.getPdfPagesDynamic(media) : media.pages
    return it.copy({
      mediaType: MEDIATYPE_DIVINA_JSON,
      metadata: this.withSeriesMetadata(it.metadata, seriesMetadata).copy({ conformsTo: PROFILE_DIVINA }),
      readingOrder: pages.map(
        (page: BookPage, index: number) =>
          new WPLinkDto({
            href: uriBuilder
              .cloneBuilder()
              .path(`books/${bookDto.id}/pages/${index + 1}`)
              .queryParam('contentNegotiation', 'false')
              .toUriString(),
            type: page.mediaType,
            width: page.dimension?.width ?? null,
            height: page.dimension?.height ?? null,
            alternate:
              !recommendedImageMediaTypes.includes(page.mediaType) && this.imageConverter.canConvertMediaType(page.mediaType, MediaType.IMAGE_JPEG_VALUE)
                ? [
                    new WPLinkDto({
                      href: uriBuilder
                        .cloneBuilder()
                        .path(`books/${bookDto.id}/pages/${index + 1}`)
                        .queryParam('contentNegotiation', 'false')
                        .queryParam('convert', 'jpeg')
                        .toUriString(),
                      type: MediaType.IMAGE_JPEG_VALUE,
                      width: page.dimension?.width ?? null,
                      height: page.dimension?.height ?? null,
                    }),
                  ]
                : [],
          }),
      ),
      resources: this.buildThumbnailLinkDtos(bookDto.id),
    })
  }

  toManifestPdf(bookDto: BookDto, media: Media, seriesMetadata: SeriesMetadata): WPPublicationDto {
    const uriBuilder = ServletUriComponentsBuilder.fromCurrentContextPath().pathSegment(...this.pathSegments)
    const it = this.toBasePublicationDto(bookDto)
    return it.copy({
      mediaType: MEDIATYPE_WEBPUB_JSON,
      metadata: this.withSeriesMetadata(it.metadata, seriesMetadata).copy({ conformsTo: PROFILE_PDF }),
      readingOrder: Array.from(
        { length: media.pageCount },
        (_, index: number) =>
          new WPLinkDto({
            href: uriBuilder
              .cloneBuilder()
              .path(`books/${bookDto.id}/pages/${index + 1}/raw`)
              .toUriString(),
            type: KomgaMediaType.PDF.type,
          }),
      ),
      resources: this.buildThumbnailLinkDtos(bookDto.id),
    })
  }

  toManifestEpub(bookDto: BookDto, media: Media, seriesMetadata: SeriesMetadata): WPPublicationDto {
    const uriBuilder = ServletUriComponentsBuilder.fromCurrentContextPath().pathSegment(...this.pathSegments)
    const extension =
      media.extension instanceof ProxyExtension && media.extension.proxyForType(MediaExtensionEpub)
        ? (() => {
            const e = this.mediaRepository.findExtensionByIdOrNull(media.bookId)
            return e instanceof MediaExtensionEpub ? e : null
          })()
        : media.extension instanceof MediaExtensionEpub
          ? media.extension
          : null
    const publication = this.toBasePublicationDto(bookDto)
    return publication.copy({
      mediaType: MEDIATYPE_WEBPUB_JSON,
      metadata: this.withSeriesMetadata(publication.metadata, seriesMetadata).copy({
        conformsTo: PROFILE_EPUB,
        rendition:
          extension?.isFixedLayout === true
            ? new Map<string, unknown>([['layout', 'fixed']])
            : extension?.isFixedLayout === false
              ? new Map<string, unknown>([['layout', 'reflowable']])
              : new Map<string, unknown>(),
      }),
      readingOrder: media.files
        .filter((it) => it.subType === MediaFile.SubType.EPUB_PAGE)
        .map(
          (it) =>
            new WPLinkDto({
              href: uriBuilder.cloneBuilder().path(`books/${bookDto.id}/resource/`).path(it.fileName).toUriString(),
              type: it.mediaType,
            }),
        ),
      resources: [
        ...this.buildThumbnailLinkDtos(bookDto.id),
        ...media.files
          .filter((it) => it.subType === MediaFile.SubType.EPUB_ASSET)
          .map(
            (it) =>
              new WPLinkDto({
                href: uriBuilder.cloneBuilder().path(`books/${bookDto.id}/resource/`).path(it.fileName).toUriString(),
                type: it.mediaType,
              }),
          ),
      ],
      toc: extension?.toc?.map((it) => this.epubTocEntryToWPLinkDto(it, uriBuilder.cloneBuilder().path(`books/${bookDto.id}/resource/`))) ?? [],
      landmarks: extension?.landmarks?.map((it) => this.epubTocEntryToWPLinkDto(it, uriBuilder.cloneBuilder().path(`books/${bookDto.id}/resource/`))) ?? [],
      pageList: extension?.pageList?.map((it) => this.epubTocEntryToWPLinkDto(it, uriBuilder.cloneBuilder().path(`books/${bookDto.id}/resource/`))) ?? [],
    })
  }

  // PORT: fonction d'extension privée EpubTocEntry.toWPLinkDto -> méthode privée
  private epubTocEntryToWPLinkDto(self: EpubTocEntry, uriBuilder: UriComponentsBuilder): WPLinkDto {
    return new WPLinkDto({
      title: self.title,
      href:
        self.href !== null
          ? (() => {
              const it = self.href
              const hashIndex = it.lastIndexOf('#')
              const fragment = hashIndex === -1 ? '' : it.substring(hashIndex + 1)
              const h = it.endsWith(`#${fragment}`) ? it.substring(0, it.length - `#${fragment}`.length) : it
              return uriBuilder.cloneBuilder().path(h).toUriString() + (fragment.length > 0 ? `#${fragment}` : '')
            })()
          : null,
      children: self.children.map((it) => this.epubTocEntryToWPLinkDto(it, uriBuilder)),
    })
  }

  protected toWPMetadataDto(bookDto: BookDto): WPMetadataDto {
    return new WPMetadataDto({
      title: bookDto.metadata.title,
      description: bookDto.metadata.summary,
      numberOfPages: bookDto.media.pagesCount,
      modified: toZonedDateTime(bookDto.lastModified),
      published: bookDto.metadata.releaseDate,
      subject: [...bookDto.metadata.tags],
      identifier: isNotBlank(bookDto.metadata.isbn) ? `urn:isbn:${bookDto.metadata.isbn}` : null,
      belongsTo: new WPBelongsToDto({
        series: [
          new WPContributorDto({
            name: bookDto.seriesTitle,
            position: bookDto.metadata.numberSort,
            links: this.getBookSeriesLink(bookDto),
          }),
        ],
      }),
    })
  }

  protected getBookSeriesLink(_bookDto: BookDto): WPLinkDto[] {
    return []
  }

  // PORT: fonction d'extension privée WPMetadataDto.withSeriesMetadata -> méthode privée
  private withSeriesMetadata(self: WPMetadataDto, seriesMetadata: SeriesMetadata): WPMetadataDto {
    return self.copy({
      language: seriesMetadata.language,
      readingProgression: (() => {
        switch (seriesMetadata.readingDirection) {
          case SeriesMetadata.ReadingDirection.LEFT_TO_RIGHT:
            return WPReadingProgressionDto.LTR
          case SeriesMetadata.ReadingDirection.RIGHT_TO_LEFT:
            return WPReadingProgressionDto.RTL
          case SeriesMetadata.ReadingDirection.VERTICAL:
            return WPReadingProgressionDto.TTB
          case SeriesMetadata.ReadingDirection.WEBTOON:
            return WPReadingProgressionDto.TTB
          case null:
            return null
        }
        return null
      })(),
    })
  }

  // PORT: fonction d'extension privée WPMetadataDto.withAuthors -> méthode privée
  private withAuthors(self: WPMetadataDto, authors: AuthorDto[]): WPMetadataDto {
    // PORT: groupBy(keySelector, valueTransform)
    const groups = new Map([...groupBy(authors, (it) => it.role)].map(([k, v]) => [k, v.map((it) => it.name)]))
    return self.copy({
      author: groups.get('author') ?? [],
      translator: groups.get('translator') ?? [],
      editor: groups.get('editor') ?? [],
      artist: groups.get('artist') ?? [],
      illustrator: groups.get('illustrator') ?? [],
      letterer: groups.get('letterer') ?? [],
      penciler: [...(groups.get('penciler') ?? []), ...(groups.get('penciller') ?? [])],
      colorist: groups.get('colorist') ?? [],
      inker: groups.get('inker') ?? [],
      // use contributor role for all roles not mentioned above
      contributor: authors.filter((it) => !wpKnownRoles.includes(it.role)).map((it) => it.name),
    })
  }

  protected getExtraLinkProperties(): Map<string, Map<string, unknown>> {
    return new Map()
  }

  protected getExtraLinks(_bookId: string): WPLinkDto[] {
    return []
  }

  // PORT: fonction d'extension privée BookDto.toWPLinkDtos -> méthode privée
  private toWPLinkDtos(self: BookDto, uriBuilder: UriComponentsBuilder): WPLinkDto[] {
    const komgaMediaType = KomgaMediaType.fromMediaType(self.media.mediaType)
    const id = self.id
    const list: WPLinkDto[] = []
    // most appropriate manifest
    list.push(
      new WPLinkDto({
        rel: OpdsLinkRel.SELF,
        href: uriBuilder.cloneBuilder().path(`books/${id}/manifest`).toUriString(),
        type: this.mediaProfileToWebPub(komgaMediaType?.profile ?? null),
        properties: this.getExtraLinkProperties(),
      }),
    )
    // PDF is also available under the Divina profile / EPUB that are Divina compatible
    if (komgaMediaType?.profile === MediaProfile.PDF || (komgaMediaType?.profile === MediaProfile.EPUB && self.media.epubDivinaCompatible))
      list.push(new WPLinkDto({ href: uriBuilder.cloneBuilder().path(`books/${id}/manifest/divina`).toUriString(), type: MEDIATYPE_DIVINA_JSON_VALUE, properties: this.getExtraLinkProperties() }))
    // main acquisition link
    list.push(
      new WPLinkDto({
        rel: OpdsLinkRel.ACQUISITION,
        type: komgaMediaType?.exportType ?? self.media.mediaType,
        href: uriBuilder.cloneBuilder().path(`books/${id}/file`).toUriString(),
        properties: this.getExtraLinkProperties(),
      }),
    )
    // extra links
    list.push(...this.getExtraLinks(id))
    return list
  }

  private mediaProfileToWebPub(profile: MediaProfile | null): string {
    switch (profile) {
      case MediaProfile.DIVINA:
        return MEDIATYPE_DIVINA_JSON_VALUE
      case MediaProfile.PDF:
        return MEDIATYPE_WEBPUB_JSON_VALUE
      case MediaProfile.EPUB:
        return MEDIATYPE_WEBPUB_JSON_VALUE
      case null:
        return MEDIATYPE_WEBPUB_JSON_VALUE
    }
    return MEDIATYPE_WEBPUB_JSON_VALUE
  }
}

// companion object
const wpKnownRoles = ['author', 'translator', 'editor', 'artist', 'illustrator', 'letterer', 'penciler', 'penciller', 'colorist', 'inker']
const recommendedImageMediaTypes = ['image/jpeg', 'image/png', 'image/gif']

// @Component
component(WebPubGenerator, {
  // PORT: constructeur privé de l'enum ImageType : conversion explicite en jeton d'injection
  inject: [{ type: ImageType as unknown as Token, qualifier: 'thumbnailType' }, ImageConverter, BookAnalyzer, MediaRepository],
})
