// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/AgeRestriction.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { DataClass, KEnum } from '../../port/kotlin.js'
import { serializable } from '../../port/java-serialization.js'

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

// : Serializable (AgeRestriction : serialVersionUID = -6060796340851263994L)
serializable(AgeRestriction, 'org.gotson.komga.domain.model.AgeRestriction')
serializable(AllowExclude, 'org.gotson.komga.domain.model.AllowExclude')
