// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/Epub2Nav.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KEnum } from '../../../port/kotlin.js'

export class Epub2Nav extends KEnum {
  static readonly TOC = new Epub2Nav('TOC', 'navMap', 'navPoint')
  static readonly PAGELIST = new Epub2Nav('PAGELIST', 'pageList', 'pageTarget')

  private constructor(
    name: string,
    readonly level1: string,
    readonly level2: string,
  ) {
    super(name)
  }
}
