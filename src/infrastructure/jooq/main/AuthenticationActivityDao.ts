// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/AuthenticationActivityDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { LocalDateTime } from '@js-joda/core'
import { AuthenticationActivity } from '../../../domain/model/AuthenticationActivity.js'
import type { KomgaUser } from '../../../domain/model/KomgaUser.js'
import { AuthenticationActivityRepository } from '../../../domain/persistence/AuthenticationActivityRepository.js'
import { toCurrentTimeZone } from '../../../language/LanguageUtils.js'
import type { Condition, Field } from '../../../port/jooq/core.js'
import { DSL, DSLContext } from '../../../port/jooq/dsl.js'
import { type AuthenticationActivityRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { component } from '../../../port/spring.js'
import { type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { toOrderBy } from '../Utils.js'

export class AuthenticationActivityDao extends SplitDslDaoBase implements AuthenticationActivityRepository {
  private readonly aa = Tables.AUTHENTICATION_ACTIVITY

  private readonly sorts = new Map<string, Field<unknown>>([
    ['dateTime', this.aa.DATE_TIME],
    ['email', this.aa.EMAIL],
    ['success', this.aa.SUCCESS],
    ['ip', this.aa.IP],
    ['error', this.aa.ERROR],
    ['userId', this.aa.USER_ID],
    ['userAgent', this.aa.USER_AGENT],
  ] as [string, Field<unknown>][])

  constructor(dslRW: DSLContext, dslRO: DSLContext) {
    super(dslRW, dslRO)
  }

  findAll(pageable: Pageable): Page<AuthenticationActivity> {
    const conditions: Condition = DSL.trueCondition()
    return this.findAllByCondition(conditions, pageable)
  }

  findAllByUser(user: KomgaUser, pageable: Pageable): Page<AuthenticationActivity> {
    const conditions = this.aa.USER_ID.eq(user.id).or(this.aa.EMAIL.eq(user.email))
    return this.findAllByCondition(conditions, pageable)
  }

  findMostRecentByUser(user: KomgaUser, apiKeyId: string | null): AuthenticationActivity | null {
    const q = this.dslRO.selectFrom(this.aa).where(this.aa.USER_ID.eq(user.id)).or(this.aa.EMAIL.eq(user.email))
    if (apiKeyId !== null) q.and(this.aa.API_KEY_ID.eq(apiKeyId))
    // PORT: selectFrom(aa).fetchOne() renvoie un AuthenticationActivityRecord en jOOQ -> fetchOneInto(aa)
    const r = q.orderBy(this.aa.DATE_TIME.desc()).limit(1).fetchOneInto(this.aa)
    return r !== null ? this.toDomain(r) : null
  }

  // PORT: surcharge privée findAll(conditions, pageable) renommée (pas de surcharge en TS)
  private findAllByCondition(conditions: Condition, pageable: Pageable): PageImpl<AuthenticationActivity> {
    const count = this.dslRO.fetchCount(this.aa, conditions)

    const orderBy = toOrderBy(pageable.sort, this.sorts)

    const itemsQuery = this.dslRO.selectFrom(this.aa).where(conditions).orderBy(orderBy)
    if (pageable.isPaged) itemsQuery.limit(pageable.pageSize).offset(pageable.offset)
    const items = itemsQuery.fetchInto(this.aa).map((it) => this.toDomain(it))

    const pageSort = orderBy.length > 0 ? pageable.sort : Sort.unsorted()
    return new PageImpl(
      items,
      pageable.isPaged ? PageRequest.of(pageable.pageNumber, pageable.pageSize, pageSort) : PageRequest.of(0, Math.max(count, 20), pageSort),
      count,
    )
  }

  insert(activity: AuthenticationActivity): void {
    this.dslRW
      .insertInto(
        this.aa,
        this.aa.USER_ID,
        this.aa.EMAIL,
        this.aa.API_KEY_ID,
        this.aa.API_KEY_COMMENT,
        this.aa.IP,
        this.aa.USER_AGENT,
        this.aa.SUCCESS,
        this.aa.ERROR,
        this.aa.SOURCE,
      )
      .values(
        activity.userId,
        activity.email,
        activity.apiKeyId,
        activity.apiKeyComment,
        activity.ip,
        activity.userAgent,
        activity.success,
        activity.error,
        activity.source,
      )
      .execute()
  }

  deleteByUser(user: KomgaUser): void {
    this.dslRW.deleteFrom(this.aa).where(this.aa.USER_ID.eq(user.id)).or(this.aa.EMAIL.eq(user.email)).execute()
  }

  deleteOlderThan(dateTime: LocalDateTime): void {
    this.dslRW.deleteFrom(this.aa).where(this.aa.DATE_TIME.lt(dateTime)).execute()
  }

  private toDomain(self: AuthenticationActivityRecord): AuthenticationActivity {
    return new AuthenticationActivity({
      userId: self.userId,
      email: self.email,
      apiKeyId: self.apiKeyId,
      apiKeyComment: self.apiKeyComment,
      ip: self.ip,
      userAgent: self.userAgent,
      success: self.success,
      error: self.error,
      dateTime: toCurrentTimeZone(self.dateTime),
      source: self.source,
    })
  }
}

component(AuthenticationActivityDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }],
  types: [AuthenticationActivityRepository],
})
