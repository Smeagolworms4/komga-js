// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/ClientSettingsDtoDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { ClientSettingDto } from '../../../interfaces/api/rest/dto/ClientSettingDto.js'
import { Tables } from '../../../port/jooq/generated/main/Tables.js'
import { DSLContext } from '../../../port/jooq/dsl.js'
import { associate } from '../../../port/kotlin.js'
import { component } from '../../../port/spring.js'

export class ClientSettingsDtoDao extends SplitDslDaoBase {
  private readonly g = Tables.CLIENT_SETTINGS_GLOBAL
  private readonly u = Tables.CLIENT_SETTINGS_USER

  constructor(dslRW: DSLContext, dslRO: DSLContext) {
    super(dslRW, dslRO)
  }

  findAllGlobal({ onlyUnauthorized = false }: { onlyUnauthorized?: boolean } = {}): Map<string, ClientSettingDto> {
    const q = this.dslRO.selectFrom(this.g)
    if (onlyUnauthorized) q.where(this.g.ALLOW_UNAUTHORIZED.isTrue())
    // PORT: fetch() d'un selectFrom -> fetchInto(table) pour obtenir des records typés
    return associate(q.fetchInto(this.g), (it) => [it.key, new ClientSettingDto({ value: it.value, allowUnauthorized: it.allowUnauthorized })])
  }

  findAllUser(userId: string): Map<string, ClientSettingDto> {
    return associate(
      // PORT: fetch() d'un selectFrom -> fetchInto(table) pour obtenir des records typés
      this.dslRO.selectFrom(this.u).where(this.u.USER_ID.eq(userId)).fetchInto(this.u),
      (it) => [it.key, new ClientSettingDto({ value: it.value, allowUnauthorized: null })],
    )
  }

  saveGlobal(key: string, value: string, allowUnauthorized: boolean): void {
    this.dslRW
      .insertInto(this.g, this.g.KEY, this.g.VALUE, this.g.ALLOW_UNAUTHORIZED)
      .values(key, value, allowUnauthorized)
      .onDuplicateKeyUpdate()
      .set(this.g.VALUE, value)
      .execute()
  }

  saveForUser(userId: string, key: string, value: string): void {
    this.dslRW
      .insertInto(this.u, this.u.USER_ID, this.u.KEY, this.u.VALUE)
      .values(userId, key, value)
      .onDuplicateKeyUpdate()
      .set(this.u.VALUE, value)
      .execute()
  }

  deleteAll(): void {
    this.dslRW.deleteFrom(this.g).execute()
    this.dslRW.deleteFrom(this.u).execute()
  }

  deleteGlobalByKeys(keys: Iterable<string>): void {
    this.dslRW.deleteFrom(this.g).where(this.g.KEY.in(keys)).execute()
  }

  deleteByUserIdAndKeys(userId: string, keys: Iterable<string>): void {
    this.dslRW.deleteFrom(this.u).where(this.u.KEY.in(keys)).and(this.u.USER_ID.eq(userId)).execute()
  }

  deleteByUserId(userId: string): void {
    this.dslRW.deleteFrom(this.u).where(this.u.USER_ID.eq(userId)).execute()
  }
}

component(ClientSettingsDtoDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }],
})
