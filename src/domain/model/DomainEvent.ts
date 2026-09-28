// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/DomainEvent.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { URL } from '../../port/java-net.js'
import { DataClass } from '../../port/kotlin.js'
import type { Book } from './Book.js'
import type { KomgaUser } from './KomgaUser.js'
import type { Library } from './Library.js'
import type { ReadList } from './ReadList.js'
import type { ReadProgress } from './ReadProgress.js'
import type { Series } from './Series.js'
import type { SeriesCollection } from './SeriesCollection.js'
import type { ThumbnailBook } from './ThumbnailBook.js'
import type { ThumbnailReadList } from './ThumbnailReadList.js'
import type { ThumbnailSeries } from './ThumbnailSeries.js'
import type { ThumbnailSeriesCollection } from './ThumbnailSeriesCollection.js'

// PORT: sealed class Kotlin -> classe abstraite ; elle étend DataClass pour donner aux sous-classes
// (data class Kotlin) equals/hashCode/toString/copy, TS n'autorisant qu'une seule classe parente
export abstract class DomainEvent<P extends object = object> extends DataClass<P> {}

export namespace DomainEvent {
  export class LibraryAdded extends DomainEvent<{ library: Library }> {
    readonly library: Library

    constructor({ library }: { library: Library }) {
      super()
      this.library = library
    }
  }

  export class LibraryUpdated extends DomainEvent<{ library: Library }> {
    readonly library: Library

    constructor({ library }: { library: Library }) {
      super()
      this.library = library
    }
  }

  export class LibraryDeleted extends DomainEvent<{ library: Library }> {
    readonly library: Library

    constructor({ library }: { library: Library }) {
      super()
      this.library = library
    }
  }

  export class LibraryScanned extends DomainEvent<{ library: Library }> {
    readonly library: Library

    constructor({ library }: { library: Library }) {
      super()
      this.library = library
    }
  }

  export class SeriesAdded extends DomainEvent<{ series: Series }> {
    readonly series: Series

    constructor({ series }: { series: Series }) {
      super()
      this.series = series
    }
  }

  export class SeriesUpdated extends DomainEvent<{ series: Series }> {
    readonly series: Series

    constructor({ series }: { series: Series }) {
      super()
      this.series = series
    }
  }

  export class SeriesDeleted extends DomainEvent<{ series: Series }> {
    readonly series: Series

    constructor({ series }: { series: Series }) {
      super()
      this.series = series
    }
  }

  export class BookAdded extends DomainEvent<{ book: Book }> {
    readonly book: Book

    constructor({ book }: { book: Book }) {
      super()
      this.book = book
    }
  }

  export class BookUpdated extends DomainEvent<{ book: Book }> {
    readonly book: Book

    constructor({ book }: { book: Book }) {
      super()
      this.book = book
    }
  }

  export class BookDeleted extends DomainEvent<{ book: Book }> {
    readonly book: Book

    constructor({ book }: { book: Book }) {
      super()
      this.book = book
    }
  }

  export class BookImported extends DomainEvent<{ book: Book | null; sourceFile: URL; success: boolean; message?: string | null }> {
    readonly book: Book | null
    readonly sourceFile: URL
    readonly success: boolean
    readonly message: string | null

    constructor({ book, sourceFile, success, message = null }: { book: Book | null; sourceFile: URL; success: boolean; message?: string | null }) {
      super()
      this.book = book
      this.sourceFile = sourceFile
      this.success = success
      this.message = message
    }
  }

  export class CollectionAdded extends DomainEvent<{ collection: SeriesCollection }> {
    readonly collection: SeriesCollection

    constructor({ collection }: { collection: SeriesCollection }) {
      super()
      this.collection = collection
    }
  }

  export class CollectionUpdated extends DomainEvent<{ collection: SeriesCollection }> {
    readonly collection: SeriesCollection

    constructor({ collection }: { collection: SeriesCollection }) {
      super()
      this.collection = collection
    }
  }

  export class CollectionDeleted extends DomainEvent<{ collection: SeriesCollection }> {
    readonly collection: SeriesCollection

    constructor({ collection }: { collection: SeriesCollection }) {
      super()
      this.collection = collection
    }
  }

  export class ReadListAdded extends DomainEvent<{ readList: ReadList }> {
    readonly readList: ReadList

    constructor({ readList }: { readList: ReadList }) {
      super()
      this.readList = readList
    }
  }

  export class ReadListUpdated extends DomainEvent<{ readList: ReadList }> {
    readonly readList: ReadList

    constructor({ readList }: { readList: ReadList }) {
      super()
      this.readList = readList
    }
  }

  export class ReadListDeleted extends DomainEvent<{ readList: ReadList }> {
    readonly readList: ReadList

    constructor({ readList }: { readList: ReadList }) {
      super()
      this.readList = readList
    }
  }

  export class ReadProgressChanged extends DomainEvent<{ progress: ReadProgress }> {
    readonly progress: ReadProgress

    constructor({ progress }: { progress: ReadProgress }) {
      super()
      this.progress = progress
    }
  }

  export class ReadProgressDeleted extends DomainEvent<{ progress: ReadProgress }> {
    readonly progress: ReadProgress

    constructor({ progress }: { progress: ReadProgress }) {
      super()
      this.progress = progress
    }
  }

  export class ReadProgressSeriesChanged extends DomainEvent<{ seriesId: string; userId: string }> {
    readonly seriesId: string
    readonly userId: string

    constructor({ seriesId, userId }: { seriesId: string; userId: string }) {
      super()
      this.seriesId = seriesId
      this.userId = userId
    }
  }

  export class ReadProgressSeriesDeleted extends DomainEvent<{ seriesId: string; userId: string }> {
    readonly seriesId: string
    readonly userId: string

    constructor({ seriesId, userId }: { seriesId: string; userId: string }) {
      super()
      this.seriesId = seriesId
      this.userId = userId
    }
  }

  export class ThumbnailBookAdded extends DomainEvent<{ thumbnail: ThumbnailBook }> {
    readonly thumbnail: ThumbnailBook

    constructor({ thumbnail }: { thumbnail: ThumbnailBook }) {
      super()
      this.thumbnail = thumbnail
    }
  }

  export class ThumbnailBookDeleted extends DomainEvent<{ thumbnail: ThumbnailBook }> {
    readonly thumbnail: ThumbnailBook

    constructor({ thumbnail }: { thumbnail: ThumbnailBook }) {
      super()
      this.thumbnail = thumbnail
    }
  }

  export class ThumbnailSeriesAdded extends DomainEvent<{ thumbnail: ThumbnailSeries }> {
    readonly thumbnail: ThumbnailSeries

    constructor({ thumbnail }: { thumbnail: ThumbnailSeries }) {
      super()
      this.thumbnail = thumbnail
    }
  }

  export class ThumbnailSeriesDeleted extends DomainEvent<{ thumbnail: ThumbnailSeries }> {
    readonly thumbnail: ThumbnailSeries

    constructor({ thumbnail }: { thumbnail: ThumbnailSeries }) {
      super()
      this.thumbnail = thumbnail
    }
  }

  export class ThumbnailSeriesCollectionAdded extends DomainEvent<{ thumbnail: ThumbnailSeriesCollection }> {
    readonly thumbnail: ThumbnailSeriesCollection

    constructor({ thumbnail }: { thumbnail: ThumbnailSeriesCollection }) {
      super()
      this.thumbnail = thumbnail
    }
  }

  export class ThumbnailSeriesCollectionDeleted extends DomainEvent<{ thumbnail: ThumbnailSeriesCollection }> {
    readonly thumbnail: ThumbnailSeriesCollection

    constructor({ thumbnail }: { thumbnail: ThumbnailSeriesCollection }) {
      super()
      this.thumbnail = thumbnail
    }
  }

  export class ThumbnailReadListAdded extends DomainEvent<{ thumbnail: ThumbnailReadList }> {
    readonly thumbnail: ThumbnailReadList

    constructor({ thumbnail }: { thumbnail: ThumbnailReadList }) {
      super()
      this.thumbnail = thumbnail
    }
  }

  export class ThumbnailReadListDeleted extends DomainEvent<{ thumbnail: ThumbnailReadList }> {
    readonly thumbnail: ThumbnailReadList

    constructor({ thumbnail }: { thumbnail: ThumbnailReadList }) {
      super()
      this.thumbnail = thumbnail
    }
  }

  export class UserUpdated extends DomainEvent<{ user: KomgaUser; expireSession: boolean }> {
    readonly user: KomgaUser
    readonly expireSession: boolean

    constructor({ user, expireSession }: { user: KomgaUser; expireSession: boolean }) {
      super()
      this.user = user
      this.expireSession = expireSession
    }
  }

  export class UserDeleted extends DomainEvent<{ user: KomgaUser }> {
    readonly user: KomgaUser

    constructor({ user }: { user: KomgaUser }) {
      super()
      this.user = user
    }
  }
}
