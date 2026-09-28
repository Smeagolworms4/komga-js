// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/AgeRestriction.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { DataClass, KEnum } from '../../port/kotlin.js'

type AgeRestrictionParams = {
  age: number
  restriction: AllowExclude
}

export class AgeRestriction extends DataClass<AgeRestrictionParams> {
  readonly age: number
  readonly restriction: AllowExclude

  constructor({ age, restriction }: AgeRestrictionParams) {
    super()
    this.age = age
    this.restriction = restriction
  }
}

export class AllowExclude extends KEnum {
  static readonly ALLOW_ONLY = new AllowExclude('ALLOW_ONLY')
  static readonly EXCLUDE = new AllowExclude('EXCLUDE')
}
