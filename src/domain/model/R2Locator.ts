// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/R2Locator.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../port/jackson.js'
import { jsonProperties } from '../../port/jackson-mapper.js'
import { DataClass, kFloat } from '../../port/kotlin.js'

type R2LocatorParams = {
  href: string
  type: string
  title?: string | null
  locations?: R2Locator.Location | null
  text?: R2Locator.Text | null
  koboSpan?: string | null
}

/**
 * Locators are meant to provide a precise location in a publication in a format that can be stored and shared.
 *
 * There are many different use cases for locators:
 * - reporting and saving the current progression
 * - bookmarks
 * - highlights & annotations
 * - search results
 * - human-readable (as-in shareable) references
 * - jumping to a location
 * - enhancing a table of contents
 *
 * Each locator must contain a reference to a resource in a publication (href and type). href must not point to the fragment of a resource.
 *
 * It may also contain:
 * - a title (`title`)
 * - one or more locations in a resource (grouped together in locations)
 * - one or more text references, if the resource is a document (`text`)
 */
export class R2Locator extends DataClass<R2LocatorParams> {
  /**
   * The URI of the resource that the Locator Object points to.
   */
  readonly href: string
  /**
   * The media type of the resource that the Locator Object points to.
   */
  readonly type: string
  /**
   * The title of the chapter or section which is more relevant in the context of this locator.
   */
  readonly title: string | null
  /**
   * One or more alternative expressions of the location.
   */
  readonly locations: R2Locator.Location | null
  /**
   * Textual context of the locator.
   */
  readonly text: R2Locator.Text | null
  /**
   * Komga specific, used to have a mapping between a [R2Locator] and a koboSpan
   */
  readonly koboSpan: string | null

  constructor({ href, type, title = null, locations = null, text = null, koboSpan = null }: R2LocatorParams) {
    super()
    this.href = href
    this.type = type
    this.title = title
    this.locations = locations
    this.text = text
    this.koboSpan = koboSpan
  }
}

type LocationParams = {
  fragments?: string[]
  progression?: number | null
  position?: number | null
  totalProgression?: number | null
}

type TextParams = {
  after?: string | null
  before?: string | null
  highlight?: string | null
}

export namespace R2Locator {
  export class Location extends DataClass<LocationParams> {
    /**
     * Contains one or more fragment in the resource referenced by the Locator Object.
     */
    readonly fragments: string[]
    /**
     * Progression in the resource expressed as a percentage.
     * Between 0 and 1.
     */
    readonly progression: number | null // PORT: Float
    /**
     * An index in the publication.
     */
    readonly position: number | null
    /**
     * Progression in the publication expressed as a percentage.
     * Between 0 and 1.
     */
    readonly totalProgression: number | null // PORT: Float

    constructor({ fragments = [], progression = null, position = null, totalProgression = null }: LocationParams = {}) {
      super()
      this.fragments = fragments
      this.progression = kFloat(progression)
      this.position = position
      this.totalProgression = kFloat(totalProgression)
    }
  }

  /**
   * A Locator Text Object contains multiple text fragments, useful to give a context to the Locator or for highlights.
   */
  export class Text extends DataClass<TextParams> {
    /**
     * The text after the locator.
     */
    readonly after: string | null
    /**
     * The text before the locator.
     */
    readonly before: string | null
    /**
     * The text at the locator.
     */
    readonly highlight: string | null

    constructor({ after = null, before = null, highlight = null }: TextParams = {}) {
      super()
      this.after = after
      this.before = before
      this.highlight = highlight
    }
  }
}

json(R2Locator, { include: 'NON_EMPTY' })
json(R2Locator.Location, { include: 'NON_EMPTY' })
json(R2Locator.Text, { include: 'NON_EMPTY' })
jsonProperties(R2Locator, {
  href: 'String',
  type: 'String',
  title: { nullable: 'String' },
  locations: { nullable: { class: R2Locator.Location } },
  text: { nullable: { class: R2Locator.Text } },
  koboSpan: { nullable: 'String' },
}, [], { required: ['href', 'type'] })
jsonProperties(R2Locator.Location, {
  fragments: { list: 'String' },
  progression: { nullable: 'Float' },
  position: { nullable: 'Int' },
  totalProgression: { nullable: 'Float' },
})
jsonProperties(R2Locator.Text, { after: { nullable: 'String' }, before: { nullable: 'String' }, highlight: { nullable: 'String' } })
