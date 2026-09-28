// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/ServerSettingsDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { IntoType } from '../../../port/jooq/core.js'
import { DSLContext } from '../../../port/jooq/dsl.js'
import { Tables } from '../../../port/jooq/generated/main/Tables.js'
import { component } from '../../../port/spring.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'

export class ServerSettingsDao extends SplitDslDaoBase {
  private readonly s = Tables.SERVER_SETTINGS

  constructor(dslRW: DSLContext, dslRO: DSLContext) {
    super(dslRW, dslRO)
  }

  getSettingByKey<T>(key: string, clazz: IntoType<T>): T | null {
    return this.dslRO.select(this.s.VALUE).from(this.s).where(this.s.KEY.eq(key)).fetchOneInto(clazz)
  }

  // PORT: surcharges saveSetting(key, String) / saveSetting(key, Boolean) / saveSetting(key, Int) fusionnées
  saveSetting(key: string, value: string | boolean | number): void {
    if (typeof value === 'string') {
      this.dslRW.insertInto(this.s).values(key, value).onDuplicateKeyUpdate().set(this.s.VALUE, value).execute()
    } else if (typeof value === 'boolean') {
      this.saveSetting(key, value.toString())
    } else {
      this.saveSetting(key, value.toString())
    }
  }

  deleteSetting(key: string): void {
    this.dslRW.deleteFrom(this.s).where(this.s.KEY.eq(key)).execute()
  }

  deleteAll(): void {
    this.dslRW.deleteFrom(this.s).execute()
  }
}

component(ServerSettingsDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }],
})
