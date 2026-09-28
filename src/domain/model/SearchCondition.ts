// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/SearchCondition.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../port/jackson.js'
import { DataClass, KEnum } from '../../port/kotlin.js'
import { jsonProperties, jsonTypeInfoDeduction, sealedInterface } from '../../port/extra-search.js'
import { Media } from './Media.js'
// PORT: alias d'import, les noms sont masqués par SearchCondition.MediaProfile / SearchCondition.ReadStatus
import { MediaProfile as DomainMediaProfile } from './MediaProfile.js'
import { ReadStatus as DomainReadStatus } from './ReadStatus.js'
import { SearchOperator } from './SearchOperator.js'
import { SeriesMetadata } from './SeriesMetadata.js'

export class SearchCondition {}

// PORT: les sealed interface Kotlin (implémentées par plusieurs classes à la fois) deviennent un type union
// et une valeur `sealedInterface` du même nom, utilisable avec `instanceof`
export namespace SearchCondition {
  // @Schema(
  //   name = "SearchConditionBook",
  //   oneOf = [AnyOfBook::class, AllOfBook::class, LibraryId::class, ReadListId::class, SeriesId::class, Deleted::class, OneShot::class, Title::class, ReleaseDate::class, Tag::class, NumberSort::class, ReadStatus::class, MediaStatus::class, MediaProfile::class, Author::class, Poster::class],
  // )
  // @JsonTypeInfo(use = JsonTypeInfo.Id.DEDUCTION)
  export type Book = AnyOfBook | AllOfBook | LibraryId | ReadListId | SeriesId | Deleted | OneShot | Title | ReleaseDate | Tag | NumberSort | ReadStatus | MediaStatus | MediaProfile | Author | Poster
  export const Book = sealedInterface<Book>('Book', () => [AnyOfBook, AllOfBook, LibraryId, ReadListId, SeriesId, Deleted, OneShot, Title, ReleaseDate, Tag, NumberSort, ReadStatus, MediaStatus, MediaProfile, Author, Poster])

  // @Schema(
  //   name = "SearchConditionSeries",
  //   oneOf = [AnyOfSeries::class, AllOfSeries::class, LibraryId::class, CollectionId::class, Deleted::class, Complete::class, OneShot::class, Title::class, TitleSort::class, ReleaseDate::class, Tag::class, SharingLabel::class, Publisher::class, Language::class, Genre::class, AgeRating::class, ReadStatus::class, SeriesStatus::class, Author::class],
  // )
  // @JsonTypeInfo(use = JsonTypeInfo.Id.DEDUCTION)
  export type Series = AnyOfSeries | AllOfSeries | LibraryId | CollectionId | Deleted | Complete | OneShot | Title | TitleSort | ReleaseDate | Tag | SharingLabel | Publisher | Language | Genre | AgeRating | ReadStatus | SeriesStatus | Author
  export const Series = sealedInterface<Series>('Series', () => [AnyOfSeries, AllOfSeries, LibraryId, CollectionId, Deleted, Complete, OneShot, Title, TitleSort, ReleaseDate, Tag, SharingLabel, Publisher, Language, Genre, AgeRating, ReadStatus, SeriesStatus, Author])

  // @Schema(name = "SearchConditionAnyOfBook")
  export class AnyOfBook extends DataClass<{ conditions: Book[] }> {
    readonly conditions: Book[]

    constructor({ conditions }: { conditions: Book[] }) {
      super()
      this.conditions = conditions
    }

    // PORT: constructeur secondaire `constructor(vararg args: Book)` → fabrique statique
    static of(...args: Book[]): AnyOfBook {
      return new AnyOfBook({ conditions: args })
    }
  }

  // @Schema(name = "SearchConditionAllOfBook")
  export class AllOfBook extends DataClass<{ conditions: Book[] }> {
    readonly conditions: Book[]

    constructor({ conditions }: { conditions: Book[] }) {
      super()
      this.conditions = conditions
    }

    // PORT: constructeur secondaire `constructor(vararg args: Book)` → fabrique statique
    static of(...args: Book[]): AllOfBook {
      return new AllOfBook({ conditions: args })
    }
  }

  // @Schema(name = "SearchConditionAnyOfSeries")
  export class AnyOfSeries extends DataClass<{ conditions: Series[] }> {
    readonly conditions: Series[]

    constructor({ conditions }: { conditions: Series[] }) {
      super()
      this.conditions = conditions
    }

    // PORT: constructeur secondaire `constructor(vararg args: Series)` → fabrique statique
    static of(...args: Series[]): AnyOfSeries {
      return new AnyOfSeries({ conditions: args })
    }
  }

  // @Schema(name = "SearchConditionAllOfSeries")
  export class AllOfSeries extends DataClass<{ conditions: Series[] }> {
    readonly conditions: Series[]

    constructor({ conditions }: { conditions: Series[] }) {
      super()
      this.conditions = conditions
    }

    // PORT: constructeur secondaire `constructor(vararg args: Series)` → fabrique statique
    static of(...args: Series[]): AllOfSeries {
      return new AllOfSeries({ conditions: args })
    }
  }

  // @Schema(name = "SearchConditionLibraryId")
  export class LibraryId extends DataClass<{ operator: SearchOperator.Equality<string> }> {
    readonly operator: SearchOperator.Equality<string>

    constructor({ operator }: { operator: SearchOperator.Equality<string> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionCollectionId")
  export class CollectionId extends DataClass<{ operator: SearchOperator.Equality<string> }> {
    readonly operator: SearchOperator.Equality<string>

    constructor({ operator }: { operator: SearchOperator.Equality<string> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionReadListId")
  export class ReadListId extends DataClass<{ operator: SearchOperator.Equality<string> }> {
    readonly operator: SearchOperator.Equality<string>

    constructor({ operator }: { operator: SearchOperator.Equality<string> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionSeriesId")
  export class SeriesId extends DataClass<{ operator: SearchOperator.Equality<string> }> {
    readonly operator: SearchOperator.Equality<string>

    constructor({ operator }: { operator: SearchOperator.Equality<string> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionDeleted")
  export class Deleted extends DataClass<{ operator: SearchOperator.Boolean }> {
    readonly operator: SearchOperator.Boolean

    constructor({ operator }: { operator: SearchOperator.Boolean }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionComplete")
  export class Complete extends DataClass<{ operator: SearchOperator.Boolean }> {
    readonly operator: SearchOperator.Boolean

    constructor({ operator }: { operator: SearchOperator.Boolean }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionOneShot")
  export class OneShot extends DataClass<{ operator: SearchOperator.Boolean }> {
    readonly operator: SearchOperator.Boolean

    constructor({ operator }: { operator: SearchOperator.Boolean }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionTitle")
  export class Title extends DataClass<{ operator: SearchOperator.StringOp }> {
    readonly operator: SearchOperator.StringOp

    constructor({ operator }: { operator: SearchOperator.StringOp }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionTitleSort")
  export class TitleSort extends DataClass<{ operator: SearchOperator.StringOp }> {
    readonly operator: SearchOperator.StringOp

    constructor({ operator }: { operator: SearchOperator.StringOp }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionReleaseDate")
  export class ReleaseDate extends DataClass<{ operator: SearchOperator.Date }> {
    readonly operator: SearchOperator.Date

    constructor({ operator }: { operator: SearchOperator.Date }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionNumberSort")
  export class NumberSort extends DataClass<{ operator: SearchOperator.Numeric<number> }> {
    readonly operator: SearchOperator.Numeric<number>

    constructor({ operator }: { operator: SearchOperator.Numeric<number> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionTag")
  export class Tag extends DataClass<{ operator: SearchOperator.EqualityNullable<string> }> {
    readonly operator: SearchOperator.EqualityNullable<string>

    constructor({ operator }: { operator: SearchOperator.EqualityNullable<string> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionSharingLabel")
  export class SharingLabel extends DataClass<{ operator: SearchOperator.EqualityNullable<string> }> {
    readonly operator: SearchOperator.EqualityNullable<string>

    constructor({ operator }: { operator: SearchOperator.EqualityNullable<string> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionPublisher")
  export class Publisher extends DataClass<{ operator: SearchOperator.Equality<string> }> {
    readonly operator: SearchOperator.Equality<string>

    constructor({ operator }: { operator: SearchOperator.Equality<string> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionLanguage")
  export class Language extends DataClass<{ operator: SearchOperator.Equality<string> }> {
    readonly operator: SearchOperator.Equality<string>

    constructor({ operator }: { operator: SearchOperator.Equality<string> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionGenre")
  export class Genre extends DataClass<{ operator: SearchOperator.EqualityNullable<string> }> {
    readonly operator: SearchOperator.EqualityNullable<string>

    constructor({ operator }: { operator: SearchOperator.EqualityNullable<string> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionAgeRating")
  export class AgeRating extends DataClass<{ operator: SearchOperator.NumericNullable<number> }> {
    readonly operator: SearchOperator.NumericNullable<number>

    constructor({ operator }: { operator: SearchOperator.NumericNullable<number> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionReadStatus")
  export class ReadStatus extends DataClass<{ operator: SearchOperator.Equality<DomainReadStatus> }> {
    readonly operator: SearchOperator.Equality<DomainReadStatus>

    constructor({ operator }: { operator: SearchOperator.Equality<DomainReadStatus> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionMediaStatus")
  export class MediaStatus extends DataClass<{ operator: SearchOperator.Equality<Media.Status> }> {
    readonly operator: SearchOperator.Equality<Media.Status>

    constructor({ operator }: { operator: SearchOperator.Equality<Media.Status> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionSeriesStatus")
  export class SeriesStatus extends DataClass<{ operator: SearchOperator.Equality<SeriesMetadata.Status> }> {
    readonly operator: SearchOperator.Equality<SeriesMetadata.Status>

    constructor({ operator }: { operator: SearchOperator.Equality<SeriesMetadata.Status> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionMediaProfile")
  export class MediaProfile extends DataClass<{ operator: SearchOperator.Equality<DomainMediaProfile> }> {
    readonly operator: SearchOperator.Equality<DomainMediaProfile>

    constructor({ operator }: { operator: SearchOperator.Equality<DomainMediaProfile> }) {
      super()
      this.operator = operator
    }
  }

  // @Schema(name = "SearchConditionAuthor")
  export class Author extends DataClass<{ operator: SearchOperator.Equality<AuthorMatch> }> {
    readonly operator: SearchOperator.Equality<AuthorMatch>

    constructor({ operator }: { operator: SearchOperator.Equality<AuthorMatch> }) {
      super()
      this.operator = operator
    }
  }

  // @JsonInclude(JsonInclude.Include.NON_NULL)
  export class AuthorMatch extends DataClass<{ name?: string | null; role?: string | null }> {
    readonly name: string | null
    readonly role: string | null

    constructor({ name = null, role = null }: { name?: string | null; role?: string | null } = {}) {
      super()
      this.name = name
      this.role = role
    }
  }

  // @Schema(name = "SearchConditionPoster")
  export class Poster extends DataClass<{ operator: SearchOperator.Equality<PosterMatch> }> {
    readonly operator: SearchOperator.Equality<PosterMatch>

    constructor({ operator }: { operator: SearchOperator.Equality<PosterMatch> }) {
      super()
      this.operator = operator
    }
  }

  // @JsonInclude(JsonInclude.Include.NON_NULL)
  export class PosterMatch extends DataClass<{ type?: PosterMatch.Type | null; selected?: boolean | null }> {
    readonly type: PosterMatch.Type | null
    readonly selected: boolean | null

    constructor({ type = null, selected = null }: { type?: PosterMatch.Type | null; selected?: boolean | null } = {}) {
      super()
      this.type = type
      this.selected = selected
    }
  }

  export namespace PosterMatch {
    export class Type extends KEnum {
      static readonly GENERATED = new Type('GENERATED')
      static readonly SIDECAR = new Type('SIDECAR')
      static readonly USER_UPLOADED = new Type('USER_UPLOADED')
    }
  }
}

// PORT: annotations Jackson (@JsonTypeInfo, @JsonProperty, @JsonInclude) et types des propriétés (réflexion Kotlin)
jsonTypeInfoDeduction(SearchCondition.Book)
jsonTypeInfoDeduction(SearchCondition.Series)
json(SearchCondition.AnyOfBook, { rename: { conditions: 'anyOf' } })
jsonProperties(SearchCondition.AnyOfBook, { conditions: { list: { class: SearchCondition.Book } } })
json(SearchCondition.AllOfBook, { rename: { conditions: 'allOf' } })
jsonProperties(SearchCondition.AllOfBook, { conditions: { list: { class: SearchCondition.Book } } })
json(SearchCondition.AnyOfSeries, { rename: { conditions: 'anyOf' } })
jsonProperties(SearchCondition.AnyOfSeries, { conditions: { list: { class: SearchCondition.Series } } })
json(SearchCondition.AllOfSeries, { rename: { conditions: 'allOf' } })
jsonProperties(SearchCondition.AllOfSeries, { conditions: { list: { class: SearchCondition.Series } } })
json(SearchCondition.LibraryId, { rename: { operator: 'libraryId' } })
jsonProperties(SearchCondition.LibraryId, { operator: { class: SearchOperator.Equality, args: ['String'] } })
json(SearchCondition.CollectionId, { rename: { operator: 'collectionId' } })
jsonProperties(SearchCondition.CollectionId, { operator: { class: SearchOperator.Equality, args: ['String'] } })
json(SearchCondition.ReadListId, { rename: { operator: 'readListId' } })
jsonProperties(SearchCondition.ReadListId, { operator: { class: SearchOperator.Equality, args: ['String'] } })
json(SearchCondition.SeriesId, { rename: { operator: 'seriesId' } })
jsonProperties(SearchCondition.SeriesId, { operator: { class: SearchOperator.Equality, args: ['String'] } })
json(SearchCondition.Deleted, { rename: { operator: 'deleted' } })
jsonProperties(SearchCondition.Deleted, { operator: { class: SearchOperator.Boolean } })
json(SearchCondition.Complete, { rename: { operator: 'complete' } })
jsonProperties(SearchCondition.Complete, { operator: { class: SearchOperator.Boolean } })
json(SearchCondition.OneShot, { rename: { operator: 'oneShot' } })
jsonProperties(SearchCondition.OneShot, { operator: { class: SearchOperator.Boolean } })
json(SearchCondition.Title, { rename: { operator: 'title' } })
jsonProperties(SearchCondition.Title, { operator: { class: SearchOperator.StringOp } })
json(SearchCondition.TitleSort, { rename: { operator: 'titleSort' } })
jsonProperties(SearchCondition.TitleSort, { operator: { class: SearchOperator.StringOp } })
json(SearchCondition.ReleaseDate, { rename: { operator: 'releaseDate' } })
jsonProperties(SearchCondition.ReleaseDate, { operator: { class: SearchOperator.Date } })
json(SearchCondition.NumberSort, { rename: { operator: 'numberSort' } })
jsonProperties(SearchCondition.NumberSort, { operator: { class: SearchOperator.Numeric, args: ['Number'] } })
json(SearchCondition.Tag, { rename: { operator: 'tag' } })
jsonProperties(SearchCondition.Tag, { operator: { class: SearchOperator.EqualityNullable, args: ['String'] } })
json(SearchCondition.SharingLabel, { rename: { operator: 'sharingLabel' } })
jsonProperties(SearchCondition.SharingLabel, { operator: { class: SearchOperator.EqualityNullable, args: ['String'] } })
json(SearchCondition.Publisher, { rename: { operator: 'publisher' } })
jsonProperties(SearchCondition.Publisher, { operator: { class: SearchOperator.Equality, args: ['String'] } })
json(SearchCondition.Language, { rename: { operator: 'language' } })
jsonProperties(SearchCondition.Language, { operator: { class: SearchOperator.Equality, args: ['String'] } })
json(SearchCondition.Genre, { rename: { operator: 'genre' } })
jsonProperties(SearchCondition.Genre, { operator: { class: SearchOperator.EqualityNullable, args: ['String'] } })
json(SearchCondition.AgeRating, { rename: { operator: 'ageRating' } })
jsonProperties(SearchCondition.AgeRating, { operator: { class: SearchOperator.NumericNullable, args: ['Number'] } })
json(SearchCondition.ReadStatus, { rename: { operator: 'readStatus' } })
jsonProperties(SearchCondition.ReadStatus, { operator: { class: SearchOperator.Equality, args: [{ enum: DomainReadStatus }] } })
json(SearchCondition.MediaStatus, { rename: { operator: 'mediaStatus' } })
jsonProperties(SearchCondition.MediaStatus, { operator: { class: SearchOperator.Equality, args: [{ enum: Media.Status }] } })
json(SearchCondition.SeriesStatus, { rename: { operator: 'seriesStatus' } })
jsonProperties(SearchCondition.SeriesStatus, { operator: { class: SearchOperator.Equality, args: [{ enum: SeriesMetadata.Status }] } })
json(SearchCondition.MediaProfile, { rename: { operator: 'mediaProfile' } })
jsonProperties(SearchCondition.MediaProfile, { operator: { class: SearchOperator.Equality, args: [{ enum: DomainMediaProfile }] } })
json(SearchCondition.Author, { rename: { operator: 'author' } })
jsonProperties(SearchCondition.Author, { operator: { class: SearchOperator.Equality, args: [{ class: SearchCondition.AuthorMatch }] } })
json(SearchCondition.AuthorMatch, { include: 'NON_NULL' })
jsonProperties(SearchCondition.AuthorMatch, { name: 'String', role: 'String' })
json(SearchCondition.Poster, { rename: { operator: 'poster' } })
jsonProperties(SearchCondition.Poster, { operator: { class: SearchOperator.Equality, args: [{ class: SearchCondition.PosterMatch }] } })
json(SearchCondition.PosterMatch, { include: 'NON_NULL' })
jsonProperties(SearchCondition.PosterMatch, { type: { enum: SearchCondition.PosterMatch.Type }, selected: 'Boolean' })
