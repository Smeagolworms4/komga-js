// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/SearchOperator.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { qualifiedNameOf, registerClass } from '../../port/jackson.js'
import { Duration, ZonedDateTime } from '@js-joda/core'
import { json } from '../../port/jackson.js'
import { DataClass, type Equatable, hash } from '../../port/kotlin.js'
import { DataObject, JsonTypes, jsonProperties, sealedInterface } from '../../port/extra-search.js'
import { openApiSchema } from '../../port/swagger-annotations.js'

export class SearchOperator {}

// PORT: les sealed interface Kotlin (implémentées par plusieurs classes à la fois) deviennent un type union
// et une valeur `sealedInterface` du même nom, utilisable avec `instanceof`
export namespace SearchOperator {
  // @Schema(
  //   name = "SearchOperatorEquality",
  //   discriminatorProperty = "operator",
  //   oneOf = [Is::class, IsNot::class],
  //   discriminatorMapping = [
  //     DiscriminatorMapping("is", Is::class),
  //     DiscriminatorMapping("isNot", IsNot::class),
  //   ],
  // )
  // @JsonTypeInfo(
  //   use = JsonTypeInfo.Id.NAME,
  //   include = JsonTypeInfo.As.PROPERTY,
  //   property = "operator",
  // )
  export type Equality<T> = Is<T> | IsNot<T>
  export const Equality = sealedInterface<Equality<unknown>>('Equality', () => [Is, IsNot])

  // @Schema(
  //   name = "SearchOperatorEqualityNullable",
  //   discriminatorProperty = "operator",
  //   oneOf = [Is::class, IsNot::class, IsNullT::class, IsNotNullT::class],
  //   discriminatorMapping = [
  //     DiscriminatorMapping("is", Is::class),
  //     DiscriminatorMapping("isNot", IsNot::class),
  //     DiscriminatorMapping("isNull", IsNullT::class),
  //     DiscriminatorMapping("isNotNull", IsNotNullT::class),
  //   ],
  // )
  // @JsonTypeInfo(
  //   use = JsonTypeInfo.Id.NAME,
  //   include = JsonTypeInfo.As.PROPERTY,
  //   property = "operator",
  // )
  export type EqualityNullable<T> = Is<T> | IsNot<T> | IsNullT<T> | IsNotNullT<T>
  export const EqualityNullable = sealedInterface<EqualityNullable<unknown>>('EqualityNullable', () => [Is, IsNot, IsNullT, IsNotNullT])

  // @Schema(
  //   name = "SearchOperatorString",
  //   discriminatorProperty = "operator",
  //   oneOf = [BeginsWith::class, DoesNotBeginWith::class, Contains::class, DoesNotContain::class, EndsWith::class, DoesNotEndWith::class, Is::class, IsNot::class],
  //   discriminatorMapping = [
  //     DiscriminatorMapping("beginsWith", BeginsWith::class),
  //     DiscriminatorMapping("doesNotBeginWith", DoesNotBeginWith::class),
  //     DiscriminatorMapping("contains", Contains::class),
  //     DiscriminatorMapping("doesNotContain", DoesNotContain::class),
  //     DiscriminatorMapping("endsWith", EndsWith::class),
  //     DiscriminatorMapping("doesNotEndWith", DoesNotEndWith::class),
  //     DiscriminatorMapping("is", Is::class),
  //     DiscriminatorMapping("isNot", IsNot::class),
  //   ],
  // )
  // @JsonTypeInfo(
  //   use = JsonTypeInfo.Id.NAME,
  //   include = JsonTypeInfo.As.PROPERTY,
  //   property = "operator",
  // )
  export type StringOp = BeginsWith | DoesNotBeginWith | Contains | DoesNotContain | EndsWith | DoesNotEndWith | Is<string> | IsNot<string>
  export const StringOp = sealedInterface<StringOp>('StringOp', () => [BeginsWith, DoesNotBeginWith, Contains, DoesNotContain, EndsWith, DoesNotEndWith, Is, IsNot])

  // @Schema(
  //   name = "SearchOperatorNumericT",
  //   discriminatorProperty = "operator",
  //   oneOf = [GreaterThan::class, LessThan::class, Is::class, IsNot::class],
  //   discriminatorMapping = [
  //     DiscriminatorMapping("greaterThan", GreaterThan::class),
  //     DiscriminatorMapping("lessThan", LessThan::class),
  //     DiscriminatorMapping("is", Is::class),
  //     DiscriminatorMapping("isNot", IsNot::class),
  //   ],
  // )
  // @JsonTypeInfo(
  //   use = JsonTypeInfo.Id.NAME,
  //   include = JsonTypeInfo.As.PROPERTY,
  //   property = "operator",
  // )
  export type Numeric<T> = GreaterThan<T> | LessThan<T> | Is<T> | IsNot<T>
  export const Numeric = sealedInterface<Numeric<unknown>>('Numeric', () => [GreaterThan, LessThan, Is, IsNot])

  // @Schema(
  //   name = "SearchOperatorNumericNullable",
  //   discriminatorProperty = "operator",
  //   oneOf = [GreaterThan::class, LessThan::class, IsNullT::class, IsNotNullT::class, Is::class, IsNot::class],
  //   discriminatorMapping = [
  //     DiscriminatorMapping("greaterThan", GreaterThan::class),
  //     DiscriminatorMapping("lessThan", LessThan::class),
  //     DiscriminatorMapping("isNull", IsNullT::class),
  //     DiscriminatorMapping("isNotNull", IsNotNullT::class),
  //     DiscriminatorMapping("is", Is::class),
  //     DiscriminatorMapping("isNot", IsNot::class),
  //   ],
  // )
  // @JsonTypeInfo(
  //   use = JsonTypeInfo.Id.NAME,
  //   include = JsonTypeInfo.As.PROPERTY,
  //   property = "operator",
  // )
  export type NumericNullable<T> = GreaterThan<T> | LessThan<T> | IsNullT<T> | IsNotNullT<T> | Is<T> | IsNot<T>
  export const NumericNullable = sealedInterface<NumericNullable<unknown>>('NumericNullable', () => [GreaterThan, LessThan, IsNullT, IsNotNullT, Is, IsNot])

  // @Schema(
  //   name = "SearchOperatorDate",
  //   discriminatorProperty = "operator",
  //   oneOf = [Before::class, After::class, IsInTheLast::class, IsNotInTheLast::class, IsNull::class, IsNotNull::class],
  //   discriminatorMapping = [
  //     DiscriminatorMapping("before", Before::class),
  //     DiscriminatorMapping("after", After::class),
  //     DiscriminatorMapping("isInTheLast", IsInTheLast::class),
  //     DiscriminatorMapping("isNotInTheLast", IsNotInTheLast::class),
  //     DiscriminatorMapping("isNull", IsNull::class),
  //     DiscriminatorMapping("isNotNull", IsNotNull::class),
  //   ],
  // )
  // @JsonTypeInfo(
  //   use = JsonTypeInfo.Id.NAME,
  //   include = JsonTypeInfo.As.PROPERTY,
  //   property = "operator",
  // )
  export type Date = Before | After | IsInTheLast | IsNotInTheLast | IsNull | IsNotNull
  export const Date = sealedInterface<Date>('Date', () => [Before, After, IsInTheLast, IsNotInTheLast, IsNull, IsNotNull])

  // @Schema(
  //   name = "SearchOperatorBoolean",
  //   discriminatorProperty = "operator",
  //   oneOf = [IsTrue::class, IsFalse::class],
  //   discriminatorMapping = [
  //     DiscriminatorMapping("isTrue", IsTrue::class),
  //     DiscriminatorMapping("isFalse", IsFalse::class),
  //   ],
  // )
  // @JsonTypeInfo(
  //   use = JsonTypeInfo.Id.NAME,
  //   include = JsonTypeInfo.As.PROPERTY,
  //   property = "operator",
  // )
  export type Boolean = IsTrue | IsFalse
  export const Boolean = sealedInterface<Boolean>('Boolean', () => [IsTrue, IsFalse])

  // @Schema(name = "SearchOperatorIs")
  // @JsonTypeName("is")
  export class Is<T> extends DataClass<{ value: T }> {
    readonly value: T

    constructor({ value }: { value: T }) {
      super()
      this.value = value
    }
  }

  // @Schema(name = "SearchOperatorIsNot")
  // @JsonTypeName("isNot")
  export class IsNot<T> extends DataClass<{ value: T }> {
    readonly value: T

    constructor({ value }: { value: T }) {
      super()
      this.value = value
    }
  }

  // @Schema(name = "SearchOperatorContains")
  // @JsonTypeName("contains")
  export class Contains extends DataClass<{ value: string }> {
    readonly value: string

    constructor({ value }: { value: string }) {
      super()
      this.value = value
    }
  }

  // @Schema(name = "SearchOperatorDoesNotContain")
  // @JsonTypeName("doesNotContain")
  export class DoesNotContain extends DataClass<{ value: string }> {
    readonly value: string

    constructor({ value }: { value: string }) {
      super()
      this.value = value
    }
  }

  // @Schema(name = "SearchOperatorBeginsWith")
  // @JsonTypeName("beginsWith")
  export class BeginsWith extends DataClass<{ value: string }> {
    readonly value: string

    constructor({ value }: { value: string }) {
      super()
      this.value = value
    }
  }

  // @Schema(name = "SearchOperatorDoesNotBeginWith")
  // @JsonTypeName("doesNotBeginWith")
  export class DoesNotBeginWith extends DataClass<{ value: string }> {
    readonly value: string

    constructor({ value }: { value: string }) {
      super()
      this.value = value
    }
  }

  // @Schema(name = "SearchOperatorEndsWith")
  // @JsonTypeName("endsWith")
  export class EndsWith extends DataClass<{ value: string }> {
    readonly value: string

    constructor({ value }: { value: string }) {
      super()
      this.value = value
    }
  }

  // @Schema(name = "SearchOperatorDoesNotEndWith")
  // @JsonTypeName("doesNotEndWith")
  export class DoesNotEndWith extends DataClass<{ value: string }> {
    readonly value: string

    constructor({ value }: { value: string }) {
      super()
      this.value = value
    }
  }

  // @Schema(name = "SearchOperatorGreaterThan")
  // @JsonTypeName("greaterThan")
  export class GreaterThan<T> extends DataClass<{ value: T }> {
    readonly value: T

    constructor({ value }: { value: T }) {
      super()
      this.value = value
    }
  }

  // @Schema(name = "SearchOperatorLessThan")
  // @JsonTypeName("lessThan")
  export class LessThan<T> extends DataClass<{ value: T }> {
    readonly value: T

    constructor({ value }: { value: T }) {
      super()
      this.value = value
    }
  }

  // @Schema(name = "SearchOperatorBefore")
  // @JsonTypeName("before")
  export class Before extends DataClass<{ dateTime: ZonedDateTime }> {
    readonly dateTime: ZonedDateTime

    constructor({ dateTime }: { dateTime: ZonedDateTime }) {
      super()
      this.dateTime = dateTime
    }
  }

  // @Schema(name = "SearchOperatorAfter")
  // @JsonTypeName("after")
  export class After extends DataClass<{ dateTime: ZonedDateTime }> {
    readonly dateTime: ZonedDateTime

    constructor({ dateTime }: { dateTime: ZonedDateTime }) {
      super()
      this.dateTime = dateTime
    }
  }

  // @Schema(name = "SearchOperatorIsInTheLast")
  // @JsonTypeName("isInTheLast")
  export class IsInTheLast extends DataClass<{ duration: Duration }> {
    readonly duration: Duration

    constructor({ duration }: { duration: Duration }) {
      super()
      this.duration = duration
    }
  }

  // @Schema(name = "SearchOperatorIsNotInTheLast")
  // @JsonTypeName("isNotInTheLast")
  export class IsNotInTheLast extends DataClass<{ duration: Duration }> {
    readonly duration: Duration

    constructor({ duration }: { duration: Duration }) {
      super()
      this.duration = duration
    }
  }

  // @Schema(name = "SearchOperatorIsTrue")
  // @JsonTypeName("isTrue")
  // PORT: data object → instance unique d'une classe nommée
  export const IsTrue = new (class IsTrue extends DataObject {})()
  export type IsTrue = typeof IsTrue

  // @Schema(name = "SearchOperatorIsFalse")
  // @JsonTypeName("isFalse")
  // PORT: data object → instance unique d'une classe nommée
  export const IsFalse = new (class IsFalse extends DataObject {})()
  export type IsFalse = typeof IsFalse

  // @Schema(name = "SearchOperatorIsNull")
  // @JsonTypeName("isNull")
  // PORT: data object → instance unique d'une classe nommée
  export const IsNull = new (class IsNull extends DataObject {})()
  export type IsNull = typeof IsNull

  // @Schema(name = "SearchOperatorIsNotNull")
  // @JsonTypeName("isNotNull")
  // PORT: data object → instance unique d'une classe nommée
  export const IsNotNull = new (class IsNotNull extends DataObject {})()
  export type IsNotNull = typeof IsNotNull

  // @Schema(name = "SearchOperatorIsNullT")
  // @JsonTypeName("isNull")
  export class IsNullT<T> implements Equatable {
    // PORT: paramètre de type fantôme, pour que IsNullT<A> et IsNullT<B> restent distincts pour TypeScript
    declare private readonly _t?: T

    equals(other: unknown): boolean {
      if (this === other) return true
      if (other === null || typeof other !== 'object' || this.constructor !== other.constructor) return false
      return true
    }

    // PORT: javaClass.hashCode() → hash du nom de la classe
    hashCode(): number {
      return hash(this.constructor.name)
    }
  }

  // @Schema(name = "SearchOperatorIsNotNullT")
  // @JsonTypeName("isNotNull")
  export class IsNotNullT<T> implements Equatable {
    // PORT: paramètre de type fantôme, pour que IsNotNullT<A> et IsNotNullT<B> restent distincts pour TypeScript
    declare private readonly _t?: T

    equals(other: unknown): boolean {
      if (this === other) return true
      if (other === null || typeof other !== 'object' || this.constructor !== other.constructor) return false
      return true
    }

    // PORT: javaClass.hashCode() → hash du nom de la classe
    hashCode(): number {
      return hash(this.constructor.name)
    }
  }
}

// PORT: annotations Jackson (@JsonTypeInfo, @JsonTypeName) et types des propriétés (réflexion Kotlin)
json(SearchOperator.Equality, { typeInfo: { property: 'operator' } })
json(SearchOperator.EqualityNullable, { typeInfo: { property: 'operator' } })
json(SearchOperator.StringOp, { typeInfo: { property: 'operator' } })
json(SearchOperator.Numeric, { typeInfo: { property: 'operator' } })
json(SearchOperator.NumericNullable, { typeInfo: { property: 'operator' } })
json(SearchOperator.Date, { typeInfo: { property: 'operator' } })
json(SearchOperator.Boolean, { typeInfo: { property: 'operator' } })
json(SearchOperator.Is, { typeName: 'is' })
jsonProperties(SearchOperator.Is, { value: { typeVar: 'T' } }, ['T'], { required: ['value'] })
json(SearchOperator.IsNot, { typeName: 'isNot' })
jsonProperties(SearchOperator.IsNot, { value: { typeVar: 'T' } }, ['T'], { required: ['value'] })
json(SearchOperator.Contains, { typeName: 'contains' })
jsonProperties(SearchOperator.Contains, { value: 'String' }, [], { required: ['value'] })
json(SearchOperator.DoesNotContain, { typeName: 'doesNotContain' })
jsonProperties(SearchOperator.DoesNotContain, { value: 'String' }, [], { required: ['value'] })
json(SearchOperator.BeginsWith, { typeName: 'beginsWith' })
jsonProperties(SearchOperator.BeginsWith, { value: 'String' }, [], { required: ['value'] })
json(SearchOperator.DoesNotBeginWith, { typeName: 'doesNotBeginWith' })
jsonProperties(SearchOperator.DoesNotBeginWith, { value: 'String' }, [], { required: ['value'] })
json(SearchOperator.EndsWith, { typeName: 'endsWith' })
jsonProperties(SearchOperator.EndsWith, { value: 'String' }, [], { required: ['value'] })
json(SearchOperator.DoesNotEndWith, { typeName: 'doesNotEndWith' })
jsonProperties(SearchOperator.DoesNotEndWith, { value: 'String' }, [], { required: ['value'] })
json(SearchOperator.GreaterThan, { typeName: 'greaterThan' })
jsonProperties(SearchOperator.GreaterThan, { value: { typeVar: 'T' } }, ['T'], { required: ['value'] })
json(SearchOperator.LessThan, { typeName: 'lessThan' })
jsonProperties(SearchOperator.LessThan, { value: { typeVar: 'T' } }, ['T'], { required: ['value'] })
json(SearchOperator.Before, { typeName: 'before' })
jsonProperties(SearchOperator.Before, { dateTime: JsonTypes.ZonedDateTime }, [], { required: ['dateTime'] })
json(SearchOperator.After, { typeName: 'after' })
jsonProperties(SearchOperator.After, { dateTime: JsonTypes.ZonedDateTime }, [], { required: ['dateTime'] })
json(SearchOperator.IsInTheLast, { typeName: 'isInTheLast' })
jsonProperties(SearchOperator.IsInTheLast, { duration: JsonTypes.Duration }, [], { required: ['duration'] })
json(SearchOperator.IsNotInTheLast, { typeName: 'isNotInTheLast' })
jsonProperties(SearchOperator.IsNotInTheLast, { duration: JsonTypes.Duration }, [], { required: ['duration'] })
json(SearchOperator.IsTrue, { typeName: 'isTrue' })
json(SearchOperator.IsFalse, { typeName: 'isFalse' })
json(SearchOperator.IsNull, { typeName: 'isNull' })
json(SearchOperator.IsNotNull, { typeName: 'isNotNull' })
json(SearchOperator.IsNullT, { typeName: 'isNull' })
json(SearchOperator.IsNotNullT, { typeName: 'isNotNull' })

// @Schema (document OpenAPI : port/swagger-annotations.ts)
openApiSchema(SearchOperator.Equality, {
  name: 'SearchOperatorEquality',
  discriminatorProperty: 'operator',
  oneOf: [SearchOperator.Is, SearchOperator.IsNot],
  discriminatorMapping: [
    { value: 'is', schema: SearchOperator.Is },
    { value: 'isNot', schema: SearchOperator.IsNot },
  ],
})
openApiSchema(SearchOperator.EqualityNullable, {
  name: 'SearchOperatorEqualityNullable',
  discriminatorProperty: 'operator',
  oneOf: [SearchOperator.Is, SearchOperator.IsNot, SearchOperator.IsNullT, SearchOperator.IsNotNullT],
  discriminatorMapping: [
    { value: 'is', schema: SearchOperator.Is },
    { value: 'isNot', schema: SearchOperator.IsNot },
    { value: 'isNull', schema: SearchOperator.IsNullT },
    { value: 'isNotNull', schema: SearchOperator.IsNotNullT },
  ],
})
openApiSchema(SearchOperator.StringOp, {
  name: 'SearchOperatorString',
  discriminatorProperty: 'operator',
  oneOf: [SearchOperator.BeginsWith, SearchOperator.DoesNotBeginWith, SearchOperator.Contains, SearchOperator.DoesNotContain, SearchOperator.EndsWith, SearchOperator.DoesNotEndWith, SearchOperator.Is, SearchOperator.IsNot],
  discriminatorMapping: [
    { value: 'beginsWith', schema: SearchOperator.BeginsWith },
    { value: 'doesNotBeginWith', schema: SearchOperator.DoesNotBeginWith },
    { value: 'contains', schema: SearchOperator.Contains },
    { value: 'doesNotContain', schema: SearchOperator.DoesNotContain },
    { value: 'endsWith', schema: SearchOperator.EndsWith },
    { value: 'doesNotEndWith', schema: SearchOperator.DoesNotEndWith },
    { value: 'is', schema: SearchOperator.Is },
    { value: 'isNot', schema: SearchOperator.IsNot },
  ],
})
openApiSchema(SearchOperator.Numeric, {
  name: 'SearchOperatorNumericT',
  discriminatorProperty: 'operator',
  oneOf: [SearchOperator.GreaterThan, SearchOperator.LessThan, SearchOperator.Is, SearchOperator.IsNot],
  discriminatorMapping: [
    { value: 'greaterThan', schema: SearchOperator.GreaterThan },
    { value: 'lessThan', schema: SearchOperator.LessThan },
    { value: 'is', schema: SearchOperator.Is },
    { value: 'isNot', schema: SearchOperator.IsNot },
  ],
})
openApiSchema(SearchOperator.NumericNullable, {
  name: 'SearchOperatorNumericNullable',
  discriminatorProperty: 'operator',
  oneOf: [SearchOperator.GreaterThan, SearchOperator.LessThan, SearchOperator.IsNullT, SearchOperator.IsNotNullT, SearchOperator.Is, SearchOperator.IsNot],
  discriminatorMapping: [
    { value: 'greaterThan', schema: SearchOperator.GreaterThan },
    { value: 'lessThan', schema: SearchOperator.LessThan },
    { value: 'isNull', schema: SearchOperator.IsNullT },
    { value: 'isNotNull', schema: SearchOperator.IsNotNullT },
    { value: 'is', schema: SearchOperator.Is },
    { value: 'isNot', schema: SearchOperator.IsNot },
  ],
})
openApiSchema(SearchOperator.Date, {
  name: 'SearchOperatorDate',
  discriminatorProperty: 'operator',
  oneOf: [SearchOperator.Before, SearchOperator.After, SearchOperator.IsInTheLast, SearchOperator.IsNotInTheLast, SearchOperator.IsNull, SearchOperator.IsNotNull],
  discriminatorMapping: [
    { value: 'before', schema: SearchOperator.Before },
    { value: 'after', schema: SearchOperator.After },
    { value: 'isInTheLast', schema: SearchOperator.IsInTheLast },
    { value: 'isNotInTheLast', schema: SearchOperator.IsNotInTheLast },
    { value: 'isNull', schema: SearchOperator.IsNull },
    { value: 'isNotNull', schema: SearchOperator.IsNotNull },
  ],
})
openApiSchema(SearchOperator.Boolean, {
  name: 'SearchOperatorBoolean',
  discriminatorProperty: 'operator',
  oneOf: [SearchOperator.IsTrue, SearchOperator.IsFalse],
  discriminatorMapping: [
    { value: 'isTrue', schema: SearchOperator.IsTrue },
    { value: 'isFalse', schema: SearchOperator.IsFalse },
  ],
})
openApiSchema(SearchOperator.Is, { name: 'SearchOperatorIs' })
openApiSchema(SearchOperator.IsNot, { name: 'SearchOperatorIsNot' })
openApiSchema(SearchOperator.Contains, { name: 'SearchOperatorContains' })
openApiSchema(SearchOperator.DoesNotContain, { name: 'SearchOperatorDoesNotContain' })
openApiSchema(SearchOperator.BeginsWith, { name: 'SearchOperatorBeginsWith' })
openApiSchema(SearchOperator.DoesNotBeginWith, { name: 'SearchOperatorDoesNotBeginWith' })
openApiSchema(SearchOperator.EndsWith, { name: 'SearchOperatorEndsWith' })
openApiSchema(SearchOperator.DoesNotEndWith, { name: 'SearchOperatorDoesNotEndWith' })
openApiSchema(SearchOperator.GreaterThan, { name: 'SearchOperatorGreaterThan' })
openApiSchema(SearchOperator.LessThan, { name: 'SearchOperatorLessThan' })
openApiSchema(SearchOperator.Before, { name: 'SearchOperatorBefore' })
openApiSchema(SearchOperator.After, { name: 'SearchOperatorAfter' })
openApiSchema(SearchOperator.IsInTheLast, { name: 'SearchOperatorIsInTheLast' })
openApiSchema(SearchOperator.IsNotInTheLast, { name: 'SearchOperatorIsNotInTheLast' })
openApiSchema(SearchOperator.IsTrue, { name: 'SearchOperatorIsTrue' })
openApiSchema(SearchOperator.IsFalse, { name: 'SearchOperatorIsFalse' })
openApiSchema(SearchOperator.IsNull, { name: 'SearchOperatorIsNull' })
openApiSchema(SearchOperator.IsNotNull, { name: 'SearchOperatorIsNotNull' })
openApiSchema(SearchOperator.IsNullT, { name: 'SearchOperatorIsNullT', supertypes: [SearchOperator.NumericNullable, SearchOperator.EqualityNullable] })
openApiSchema(SearchOperator.IsNotNullT, { name: 'SearchOperatorIsNotNullT', supertypes: [SearchOperator.NumericNullable, SearchOperator.EqualityNullable] })

// Class.forName / noms qualifiés Java (messages d'erreur Jackson)
for (const [name, value] of Object.entries(SearchOperator))
  if (value !== null && (typeof value === 'object' || typeof value === 'function') && qualifiedNameOf(value) === null)
    registerClass(`org.gotson.komga.domain.model.SearchOperator$${name}`, value as never)
