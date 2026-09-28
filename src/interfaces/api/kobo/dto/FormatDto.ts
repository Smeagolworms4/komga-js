// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/FormatDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../../../port/kotlin.js'

export class FormatDto extends KEnum {
  static readonly EPUB3FL = new FormatDto('EPUB3FL')
  static readonly EPUB = new FormatDto('EPUB')
  static readonly EPUB3 = new FormatDto('EPUB3')
  static readonly KEPUB = new FormatDto('KEPUB')
}
