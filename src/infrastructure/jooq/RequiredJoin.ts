// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/RequiredJoin.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass } from '../../port/kotlin.js'
import { DataObject } from '../../port/extra-search.js'

/**
 * An indication that some tables need to be joined for query conditions to work
 */
export abstract class RequiredJoin {}

export namespace RequiredJoin {
  export const BookMetadata = new (class BookMetadata extends DataObject {})()

  export const Media = new (class Media extends DataObject {})()

  export class ReadProgress extends DataClass<{ userId: string }> {
    readonly userId: string
    constructor({ userId }: { userId: string }) {
      super()
      this.userId = userId
    }
  }

  export class ReadList extends DataClass<{ readListId: string }> {
    readonly readListId: string
    constructor({ readListId }: { readListId: string }) {
      super()
      this.readListId = readListId
    }
  }

  export class Collection extends DataClass<{ collectionId: string }> {
    readonly collectionId: string
    constructor({ collectionId }: { collectionId: string }) {
      super()
      this.collectionId = collectionId
    }
  }

  export const BookMetadataAggregation = new (class BookMetadataAggregation extends DataObject {})()

  export const SeriesMetadata = new (class SeriesMetadata extends DataObject {})()
}
