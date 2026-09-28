// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/opds/OpdsCommonController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { BookLifecycle } from '../../../domain/service/BookLifecycle.js'
import { ImageConverter } from '../../../infrastructure/image/ImageConverter.js'
import { ImageType } from '../../../infrastructure/image/ImageType.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { HttpStatus, MediaType, ResponseStatusException, authenticationPrincipal, pathVariable, restController } from '../../../port/spring-web.js'
import { ContentRestrictionChecker } from '../ContentRestrictionChecker.js'

export class OpdsCommonController {
  constructor(
    private readonly contentRestrictionChecker: ContentRestrictionChecker,
    private readonly bookLifecycle: BookLifecycle,
    private readonly imageConverter: ImageConverter,
  ) {}

  // @ApiResponse(content = [Content(schema = Schema(type = "string", format = "binary"))])
  // PORT: async (BookLifecycle.getThumbnailBytesOriginal, ImageConverter.convertImage)
  async getBookThumbnail(principal: KomgaPrincipal, bookId: string): Promise<Uint8Array> {
    this.contentRestrictionChecker.checkContentRestrictionBook(principal.user, bookId)
    const poster = (await this.bookLifecycle.getThumbnailBytesOriginal(bookId)) ?? throwNotFound()
    return poster.mediaType !== ImageType.JPEG.mediaType ? await this.imageConverter.convertImage(poster.bytes, ImageType.JPEG.imageIOFormat) : poster.bytes
  }
}

function throwNotFound(): never {
  throw new ResponseStatusException(HttpStatus.NOT_FOUND)
}

// @RestController
restController(OpdsCommonController, {
  inject: [ContentRestrictionChecker, BookLifecycle, ImageConverter],
  javaName: 'org.gotson.komga.interfaces.api.opds.OpdsCommonController',
  handlers: {
    getBookThumbnail: {
      mapping: { method: 'GET', path: ['/opds/v1.2/books/{bookId}/thumbnail', '/opds/v2/books/{bookId}/thumbnail'], produces: [MediaType.IMAGE_JPEG_VALUE] },
      args: [authenticationPrincipal(), pathVariable('bookId')],
    },
  },
})
