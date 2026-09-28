// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/ThumbnailSize.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../port/kotlin.js'

export class ThumbnailSize extends KEnum {
  static readonly DEFAULT = new ThumbnailSize('DEFAULT', 300)
  static readonly MEDIUM = new ThumbnailSize('MEDIUM', 600)
  static readonly LARGE = new ThumbnailSize('LARGE', 900)
  static readonly XLARGE = new ThumbnailSize('XLARGE', 1200)

  private constructor(
    name: string,
    readonly maxEdge: number,
  ) {
    super(name)
  }
}
