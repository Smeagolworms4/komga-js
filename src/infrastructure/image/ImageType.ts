// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/image/ImageType.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../port/kotlin.js'

export class ImageType extends KEnum {
  static readonly PNG = new ImageType('PNG', 'image/png', 'PNG')
  static readonly JPEG = new ImageType('JPEG', 'image/jpeg', 'JPEG')

  private constructor(
    name: string,
    readonly mediaType: string,
    readonly imageIOFormat: string,
  ) {
    super(name)
  }
}
