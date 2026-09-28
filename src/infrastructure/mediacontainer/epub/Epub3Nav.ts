// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/Epub3Nav.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../../port/kotlin.js'

export class Epub3Nav extends KEnum {
  static readonly TOC = new Epub3Nav('TOC', 'toc')
  static readonly LANDMARKS = new Epub3Nav('LANDMARKS', 'landmarks')
  static readonly PAGELIST = new Epub3Nav('PAGELIST', 'page-list')

  private constructor(
    name: string,
    readonly value: string,
  ) {
    super(name)
  }
}
