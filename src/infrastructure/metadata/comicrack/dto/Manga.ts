// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/comicrack/dto/Manga.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { KEnum, associateBy, lazy } from '../../../../port/kotlin.js'

export class Manga extends KEnum {
  static readonly UNKNOWN = new Manga('UNKNOWN', 'Unknown')
  static readonly NO = new Manga('NO', 'No')
  static readonly YES = new Manga('YES', 'Yes')
  static readonly YES_AND_RIGHT_TO_LEFT = new Manga('YES_AND_RIGHT_TO_LEFT', 'YesAndRightToLeft')

  private constructor(
    name: string,
    private readonly value: string,
  ) {
    super(name)
  }

  // companion object
  private static get map(): Map<string, Manga> {
    return lazy(Manga, 'map', () => associateBy(Manga.entries(), (it) => it.value))
  }

  // @JsonCreator
  static fromValue(value: string): Manga | null {
    return Manga.map.get(value) ?? null
  }
}

json(Manga, { creator: (value) => Manga.fromValue(value) })
