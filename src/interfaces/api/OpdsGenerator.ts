// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/OpdsGenerator.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { MediaRepository } from '../../domain/persistence/MediaRepository.js'
import { BookAnalyzer } from '../../domain/service/BookAnalyzer.js'
import { ImageConverter } from '../../infrastructure/image/ImageConverter.js'
import { ImageType } from '../../infrastructure/image/ImageType.js'
import { type Token, component } from '../../port/spring.js'
import { ServletUriComponentsBuilder } from '../../port/spring-web-uri.js'
import {
  MEDIATYPE_OPDS_AUTHENTICATION_JSON_VALUE,
  MEDIATYPE_OPDS_JSON_VALUE,
  MEDIATYPE_OPDS_PUBLICATION_JSON,
  MEDIATYPE_PROGRESSION_JSON_VALUE,
  REL_PROGRESSION_API,
} from './dto/Constants.js'
import { WPLinkDto, type WPPublicationDto } from './dto/WepPub.js'
import { ROUTE_AUTH } from './opds/v2/Opds2Controller.js'
import { AuthenticationDocumentDto, AuthenticationFlowDto, AuthenticationType, LabelsDto } from './opds/v2/dto/OpdsAuthDto.js'
import type { BookDto } from './rest/dto/BookDto.js'
import { WebPubGenerator } from './WebPubGenerator.js'

export class OpdsGenerator extends WebPubGenerator {
  protected override readonly pathSegments: string[] = ['opds', 'v2']

  constructor(
    // @Qualifier("thumbnailType")
    thumbnailType: ImageType,
    imageConverter: ImageConverter,
    bookAnalyzer: BookAnalyzer,
    mediaRepository: MediaRepository,
  ) {
    super(thumbnailType, imageConverter, bookAnalyzer, mediaRepository)
  }

  toOpdsPublicationDto(bookDto: BookDto): WPPublicationDto {
    return this.toBasePublicationDto(bookDto).copy({ images: this.buildThumbnailLinkDtos(bookDto.id) })
  }

  // PORT: MediaType -> chaîne
  protected override getDefaultMediaType(): string {
    return MEDIATYPE_OPDS_PUBLICATION_JSON
  }

  protected override getBookSeriesLink(bookDto: BookDto): WPLinkDto[] {
    return [
      new WPLinkDto({
        href: ServletUriComponentsBuilder.fromCurrentContextPath()
          .pathSegment(...this.pathSegments)
          .path(`series/${bookDto.seriesId}`)
          .toUriString(),
        type: MEDIATYPE_OPDS_JSON_VALUE,
      }),
    ]
  }

  protected override getExtraLinkProperties(): Map<string, Map<string, unknown>> {
    return new Map([
      [
        'authenticate',
        new Map<string, unknown>([
          ['href', ServletUriComponentsBuilder.fromCurrentContextPath().pathSegment(...this.pathSegments).path(ROUTE_AUTH).toUriString()],
          ['type', MEDIATYPE_OPDS_AUTHENTICATION_JSON_VALUE],
        ]),
      ],
    ])
  }

  protected override getExtraLinks(bookId: string): WPLinkDto[] {
    const list: WPLinkDto[] = []
    list.push(
      new WPLinkDto({
        type: MEDIATYPE_PROGRESSION_JSON_VALUE,
        rel: REL_PROGRESSION_API,
        href: ServletUriComponentsBuilder.fromCurrentContextPath()
          .pathSegment(...this.pathSegments)
          .path(`books/${bookId}/progression`)
          .toUriString(),
        properties: this.getExtraLinkProperties(),
      }),
    )
    return list
  }

  generateOpdsAuthDocument(): AuthenticationDocumentDto {
    return new AuthenticationDocumentDto({
      id: ServletUriComponentsBuilder.fromCurrentContextPath().pathSegment(...this.pathSegments).path(ROUTE_AUTH).toUriString(),
      title: 'Komga',
      description: 'Enter your email and password to authenticate.',
      links: [
        new WPLinkDto({ rel: 'help', href: 'https://komga.org' }),
        new WPLinkDto({ rel: 'logo', href: ServletUriComponentsBuilder.fromCurrentContextPath().pathSegment('android-chrome-512x512.png').toUriString() }),
      ],
      authentication: [
        new AuthenticationFlowDto({
          type: AuthenticationType.BASIC,
          labels: new LabelsDto({ login: 'Email', password: 'Password' }),
        }),
      ],
    })
  }
}

// @Component
component(OpdsGenerator, {
  // PORT: constructeur privé de l'enum ImageType : conversion explicite en jeton d'injection
  inject: [{ type: ImageType as unknown as Token, qualifier: 'thumbnailType' }, ImageConverter, BookAnalyzer, MediaRepository],
})
