// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/SearchOperatorUtils.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ChronoUnit, LocalDate, ZoneOffset } from '@js-joda/core'
import { SearchOperator } from '../../domain/model/SearchOperator.js'
import { stripAccents } from '../../language/LanguageUtils.js'
import type { Condition, Field } from '../../port/jooq/core.js'
import { eq } from '../../port/kotlin.js'
import { udfStripAccents, unicode1 } from './Utils.js'

// PORT: les surcharges Kotlin de l'extension `toCondition` (résolues statiquement selon le type du receveur)
// deviennent des fonctions distinctes, suffixées par le type du receveur.

export function toConditionEqualityString(
  self: SearchOperator.Equality<string>,
  field: Field<string>,
  { ignoreCase = false }: { ignoreCase?: boolean } = {},
): Condition {
  if (self instanceof SearchOperator.Is) return ignoreCase ? unicode1(field).equal(self.value) : field.equal(self.value)
  else return ignoreCase ? unicode1(field).notEqual(self.value) : field.notEqual(self.value)
}

export function toConditionEquality<T>(self: SearchOperator.Equality<T>, field: Field<T>): Condition {
  if (self instanceof SearchOperator.Is) return field.eq(self.value)
  else return field.ne(self.value)
}

export function toConditionEqualityConverter<T>(self: SearchOperator.Equality<T>, field: Field<string>, converter: (t: T) => string): Condition {
  if (self instanceof SearchOperator.Is) return field.eq(converter(self.value))
  else return field.ne(converter(self.value))
}

export function toConditionStringOp(self: SearchOperator.StringOp, field: Field<string>): Condition {
  if (self instanceof SearchOperator.BeginsWith) return udfStripAccents(field).startsWithIgnoreCase(stripAccents(self.value))
  else if (self instanceof SearchOperator.DoesNotBeginWith) return udfStripAccents(field).startsWithIgnoreCase(stripAccents(self.value)).not()
  else if (self instanceof SearchOperator.EndsWith) return udfStripAccents(field).endsWithIgnoreCase(stripAccents(self.value))
  else if (self instanceof SearchOperator.DoesNotEndWith) return udfStripAccents(field).endsWithIgnoreCase(stripAccents(self.value)).not()
  else if (self instanceof SearchOperator.Contains) return udfStripAccents(field).containsIgnoreCase(stripAccents(self.value))
  else if (self instanceof SearchOperator.DoesNotContain) return udfStripAccents(field).notContainsIgnoreCase(stripAccents(self.value))
  else if (self instanceof SearchOperator.Is) return unicode1(field).equal(self.value as string)
  else return unicode1(field).notEqual((self as SearchOperator.IsNot<string>).value as string)
}

export function toConditionDate(self: SearchOperator.Date, field: Field<LocalDate>): Condition {
  if (self instanceof SearchOperator.After) return field.gt(self.dateTime.withZoneSameInstant(ZoneOffset.UTC).toLocalDate())
  else if (self instanceof SearchOperator.Before) return field.lt(self.dateTime.withZoneSameInstant(ZoneOffset.UTC).toLocalDate())
  else if (self instanceof SearchOperator.IsInTheLast) return field.gt(LocalDate.now(ZoneOffset.UTC).minus(self.duration.toDays(), ChronoUnit.DAYS))
  else if (self instanceof SearchOperator.IsNotInTheLast) return field.lt(LocalDate.now(ZoneOffset.UTC).minus(self.duration.toDays(), ChronoUnit.DAYS))
  else if (eq(self, SearchOperator.IsNull)) return field.isNull()
  else return field.isNotNull()
}

export function toConditionNumericNullable(self: SearchOperator.NumericNullable<number>, field: Field<number>): Condition {
  if (self instanceof SearchOperator.Is) return field.eq(self.value as number)
  else if (self instanceof SearchOperator.IsNot) return field.ne(self.value as number).or(field.isNull())
  else if (self instanceof SearchOperator.GreaterThan) return field.greaterOrEqual(self.value)
  else if (self instanceof SearchOperator.LessThan) return field.lessOrEqual(self.value)
  else if (self instanceof SearchOperator.IsNullT) return field.isNull()
  else return field.isNotNull()
}

export function toConditionNumeric(self: SearchOperator.Numeric<number>, field: Field<number>): Condition {
  if (self instanceof SearchOperator.Is) return field.eq(self.value as number)
  else if (self instanceof SearchOperator.IsNot) return field.ne(self.value as number)
  else if (self instanceof SearchOperator.GreaterThan) return field.greaterOrEqual(self.value)
  else return field.lessOrEqual((self as SearchOperator.LessThan<number>).value)
}

export function toConditionBoolean(self: SearchOperator.Boolean, field: Field<boolean>): Condition {
  if (eq(self, SearchOperator.IsTrue)) return field.isTrue()
  else return field.isFalse()
}
