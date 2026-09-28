// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/SplitDslDaoBase.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type DSLContext, isActualTransactionActive, isCurrentTransactionReadOnly } from '../../port/jooq/dsl.js'

export abstract class SplitDslDaoBase {
  readonly dslRW: DSLContext
  private readonly _dslRO: DSLContext

  constructor(dslRW: DSLContext, dslRO: DSLContext) {
    this.dslRW = dslRW
    this._dslRO = dslRO
  }

  get dslRO(): DSLContext {
    // PORT: TransactionSynchronizationManager -> état de transaction de la connexion RW
    if (isActualTransactionActive(this.dslRW.db) && !isCurrentTransactionReadOnly(this.dslRW.db)) return this.dslRW
    else return this._dslRO
  }
}
