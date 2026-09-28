// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/SeriesCoverDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Library } from '../../../../domain/model/Library.js'
import { KEnum, NoWhenBranchMatchedException } from '../../../../port/kotlin.js'

export class SeriesCoverDto extends KEnum {
  static readonly FIRST = new SeriesCoverDto('FIRST')
  static readonly FIRST_UNREAD_OR_FIRST = new SeriesCoverDto('FIRST_UNREAD_OR_FIRST')
  static readonly FIRST_UNREAD_OR_LAST = new SeriesCoverDto('FIRST_UNREAD_OR_LAST')
  static readonly LAST = new SeriesCoverDto('LAST')
}

export function toDto(self: Library.SeriesCover): SeriesCoverDto {
  switch (self) {
    case Library.SeriesCover.FIRST:
      return SeriesCoverDto.FIRST
    case Library.SeriesCover.FIRST_UNREAD_OR_FIRST:
      return SeriesCoverDto.FIRST_UNREAD_OR_FIRST
    case Library.SeriesCover.FIRST_UNREAD_OR_LAST:
      return SeriesCoverDto.FIRST_UNREAD_OR_LAST
    case Library.SeriesCover.LAST:
      return SeriesCoverDto.LAST
  }
  // PORT: when exhaustif
  throw new NoWhenBranchMatchedException()
}

export function toDomain(self: SeriesCoverDto): Library.SeriesCover {
  switch (self) {
    case SeriesCoverDto.FIRST:
      return Library.SeriesCover.FIRST
    case SeriesCoverDto.FIRST_UNREAD_OR_FIRST:
      return Library.SeriesCover.FIRST_UNREAD_OR_FIRST
    case SeriesCoverDto.FIRST_UNREAD_OR_LAST:
      return Library.SeriesCover.FIRST_UNREAD_OR_LAST
    case SeriesCoverDto.LAST:
      return Library.SeriesCover.LAST
  }
  // PORT: when exhaustif
  throw new NoWhenBranchMatchedException()
}
