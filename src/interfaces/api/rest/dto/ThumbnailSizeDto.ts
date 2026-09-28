// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ThumbnailSizeDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ThumbnailSize } from '../../../../domain/model/ThumbnailSize.js'
import { KEnum } from '../../../../port/kotlin.js'

export class ThumbnailSizeDto extends KEnum {
  static readonly DEFAULT = new ThumbnailSizeDto('DEFAULT')
  static readonly MEDIUM = new ThumbnailSizeDto('MEDIUM')
  static readonly LARGE = new ThumbnailSizeDto('LARGE')
  static readonly XLARGE = new ThumbnailSizeDto('XLARGE')
}

export function toDto(self: ThumbnailSize): ThumbnailSizeDto {
  switch (self) {
    case ThumbnailSize.DEFAULT:
      return ThumbnailSizeDto.DEFAULT
    case ThumbnailSize.MEDIUM:
      return ThumbnailSizeDto.MEDIUM
    case ThumbnailSize.LARGE:
      return ThumbnailSizeDto.LARGE
    case ThumbnailSize.XLARGE:
      return ThumbnailSizeDto.XLARGE
  }
  // PORT: when exhaustif
  throw new Error(`Unknown ${self}`)
}

export function toDomain(self: ThumbnailSizeDto): ThumbnailSize {
  switch (self) {
    case ThumbnailSizeDto.DEFAULT:
      return ThumbnailSize.DEFAULT
    case ThumbnailSizeDto.MEDIUM:
      return ThumbnailSize.MEDIUM
    case ThumbnailSizeDto.LARGE:
      return ThumbnailSize.LARGE
    case ThumbnailSizeDto.XLARGE:
      return ThumbnailSize.XLARGE
  }
  // PORT: when exhaustif
  throw new Error(`Unknown ${self}`)
}
