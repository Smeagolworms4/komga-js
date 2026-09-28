// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/KomgaUserDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { AgeRestriction, AllowExclude } from '../../../domain/model/AgeRestriction.js'
import { ApiKey } from '../../../domain/model/ApiKey.js'
import { ContentRestrictions } from '../../../domain/model/ContentRestrictions.js'
import { KomgaUser } from '../../../domain/model/KomgaUser.js'
import { UserRoles } from '../../../domain/model/UserRoles.js'
import { KomgaUserRepository } from '../../../domain/persistence/KomgaUserRepository.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { Tables, type UserApiKeyRecord } from '../../../port/jooq/generated/main/Tables.js'
import { toCurrentTimeZone } from '../../../language/LanguageUtils.js'
import type { Record, Select } from '../../../port/jooq/core.js'
import { DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { component } from '../../../port/spring.js'
import { distinctSet, firstOrNull, mapNotNull } from '../../../port/kotlin.js'

export class KomgaUserDao extends SplitDslDaoBase implements KomgaUserRepository {
  private readonly u = Tables.USER
  private readonly ur = Tables.USER_ROLE
  private readonly ul = Tables.USER_LIBRARY_SHARING
  private readonly us = Tables.USER_SHARING
  private readonly ar = Tables.ANNOUNCEMENTS_READ
  private readonly uak = Tables.USER_API_KEY

  constructor(dslRW: DSLContext, dslRO: DSLContext) {
    super(dslRW, dslRO)
  }

  count(): number {
    return this.dslRO.fetchCount(this.u)
  }

  findAll(): KomgaUser[] {
    return this.fetchAndMap(this.selectBase(this.dslRO), this.dslRO)
  }

  findApiKeyByUserId(userId: string): ApiKey[] {
    return this.dslRO
      .selectFrom(this.uak)
      .where(this.uak.USER_ID.eq(userId))
      .fetchInto(this.uak)
      .map((it) => this.toDomain(it))
  }

  findByIdOrNull(id: string): KomgaUser | null {
    return firstOrNull(this.fetchAndMap(this.selectBase(this.dslRO).where(this.u.ID.equal(id)), this.dslRO))
  }

  private selectBase(self: DSLContext): Select {
    return self.select(...this.u.fields()).select(this.ul.LIBRARY_ID).from(this.u).leftJoin(this.ul).onKey()
  }

  private fetchAndMap(self: Select, dsl: DSLContext): KomgaUser[] {
    return [
      ...self.fetchGroups(
        (it: Record) => it.into(this.u),
        (it: Record) => it.into(this.ul),
      ),
    ].map(([userRecord, ulr]) => {
      // PORT: selectFrom(us).toList() renvoie des UserSharingRecord en jOOQ : fetchInto(us)
      const usr = dsl.selectFrom(this.us).where(this.us.USER_ID.eq(userRecord.id)).fetchInto(this.us)
      const roles = dsl.select(this.ur.ROLE).from(this.ur).where(this.ur.USER_ID.eq(userRecord.id)).fetch(this.ur.ROLE)
      return new KomgaUser({
        email: userRecord.email,
        password: userRecord.password,
        roles: UserRoles.valuesOf(roles),
        sharedLibrariesIds: distinctSet(mapNotNull(ulr, (it) => it.libraryId)),
        sharedAllLibraries: userRecord.sharedAllLibraries,
        restrictions: new ContentRestrictions({
          ageRestriction:
            userRecord.ageRestriction !== null && userRecord.ageRestrictionAllowOnly !== null
              ? new AgeRestriction({ age: userRecord.ageRestriction, restriction: userRecord.ageRestrictionAllowOnly ? AllowExclude.ALLOW_ONLY : AllowExclude.EXCLUDE })
              : null,
          labelsAllow: distinctSet(usr.filter((it) => it.allow).map((it) => it.label)),
          labelsExclude: distinctSet(usr.filter((it) => !it.allow).map((it) => it.label)),
        }),
        id: userRecord.id,
        createdDate: toCurrentTimeZone(userRecord.createdDate),
        lastModifiedDate: toCurrentTimeZone(userRecord.lastModifiedDate),
      })
    })
  }

  // PORT: surcharges insert(KomgaUser) / insert(ApiKey) fusionnées (union de types)
  insert(userOrApiKey: KomgaUser | ApiKey): void {
    if (userOrApiKey instanceof KomgaUser) this.insertUser(userOrApiKey)
    else this.insertApiKey(userOrApiKey)
  }

  // PORT: override fun insert(user: KomgaUser), appelée par insert() ci-dessus
  // @Transactional
  private insertUser(user: KomgaUser): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .insertInto(this.u)
        .set(this.u.ID, user.id)
        .set(this.u.EMAIL, user.email)
        .set(this.u.PASSWORD, user.password)
        .set(this.u.SHARED_ALL_LIBRARIES, user.sharedAllLibraries)
        .set(this.u.AGE_RESTRICTION, user.restrictions.ageRestriction?.age ?? null)
        .set(
          this.u.AGE_RESTRICTION_ALLOW_ONLY,
          // when (user.restrictions.ageRestriction?.restriction)
          ((it) => (it === AllowExclude.ALLOW_ONLY ? true : it === AllowExclude.EXCLUDE ? false : null))(user.restrictions.ageRestriction?.restriction ?? null),
        )
        .execute()

      this.insertRoles(this.dslRW, user)
      this.insertSharedLibraries(this.dslRW, user)
      this.insertSharingRestrictions(this.dslRW, user)
    })
  }

  // PORT: override fun insert(apiKey: ApiKey), appelée par insert() ci-dessus
  private insertApiKey(apiKey: ApiKey): void {
    this.dslRW
      .insertInto(this.uak)
      .set(this.uak.ID, apiKey.id)
      .set(this.uak.USER_ID, apiKey.userId)
      .set(this.uak.API_KEY, apiKey.key)
      .set(this.uak.COMMENT, apiKey.comment)
      .execute()
  }

  // @Transactional
  update(user: KomgaUser): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .update(this.u)
        .set(this.u.EMAIL, user.email)
        .set(this.u.PASSWORD, user.password)
        .set(this.u.SHARED_ALL_LIBRARIES, user.sharedAllLibraries)
        .set(this.u.AGE_RESTRICTION, user.restrictions.ageRestriction?.age ?? null)
        .set(
          this.u.AGE_RESTRICTION_ALLOW_ONLY,
          // when (user.restrictions.ageRestriction?.restriction)
          ((it) => (it === AllowExclude.ALLOW_ONLY ? true : it === AllowExclude.EXCLUDE ? false : null))(user.restrictions.ageRestriction?.restriction ?? null),
        )
        .set(this.u.LAST_MODIFIED_DATE, LocalDateTime.now(ZoneId.of('Z')))
        .where(this.u.ID.eq(user.id))
        .execute()

      this.dslRW.deleteFrom(this.ur).where(this.ur.USER_ID.eq(user.id)).execute()

      this.dslRW.deleteFrom(this.ul).where(this.ul.USER_ID.eq(user.id)).execute()

      this.dslRW.deleteFrom(this.us).where(this.us.USER_ID.eq(user.id)).execute()

      this.insertRoles(this.dslRW, user)
      this.insertSharedLibraries(this.dslRW, user)
      this.insertSharingRestrictions(this.dslRW, user)
    })
  }

  saveAnnouncementIdsRead(user: KomgaUser, announcementIds: ReadonlySet<string>): void {
    this.dslRW.batch([...announcementIds].map((it) => this.dslRW.insertInto(this.ar).values(user.id, it).onDuplicateKeyIgnore())).execute()
  }

  private insertRoles(self: DSLContext, user: KomgaUser): void {
    for (const it of user.roles) {
      self.insertInto(this.ur).columns(this.ur.USER_ID, this.ur.ROLE).values(user.id, it.name).execute()
    }
  }

  private insertSharedLibraries(self: DSLContext, user: KomgaUser): void {
    for (const it of user.sharedLibrariesIds) {
      self.insertInto(this.ul).columns(this.ul.USER_ID, this.ul.LIBRARY_ID).values(user.id, it).execute()
    }
  }

  private insertSharingRestrictions(self: DSLContext, user: KomgaUser): void {
    for (const label of user.restrictions.labelsAllow) {
      self.insertInto(this.us).columns(this.us.USER_ID, this.us.ALLOW, this.us.LABEL).values(user.id, true, label).execute()
    }

    for (const label of user.restrictions.labelsExclude) {
      self.insertInto(this.us).columns(this.us.USER_ID, this.us.ALLOW, this.us.LABEL).values(user.id, false, label).execute()
    }
  }

  // @Transactional
  delete(userId: string): void {
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.uak).where(this.uak.USER_ID.equal(userId)).execute()
      this.dslRW.deleteFrom(this.ar).where(this.ar.USER_ID.equal(userId)).execute()
      this.dslRW.deleteFrom(this.us).where(this.us.USER_ID.equal(userId)).execute()
      this.dslRW.deleteFrom(this.ul).where(this.ul.USER_ID.equal(userId)).execute()
      this.dslRW.deleteFrom(this.ur).where(this.ur.USER_ID.equal(userId)).execute()
      this.dslRW.deleteFrom(this.u).where(this.u.ID.equal(userId)).execute()
    })
  }

  // @Transactional
  deleteAll(): void {
    transactional(this.dslRW.db, () => {
      this.dslRW.deleteFrom(this.uak).execute()
      this.dslRW.deleteFrom(this.ar).execute()
      this.dslRW.deleteFrom(this.us).execute()
      this.dslRW.deleteFrom(this.ul).execute()
      this.dslRW.deleteFrom(this.ur).execute()
      this.dslRW.deleteFrom(this.u).execute()
    })
  }

  deleteApiKeyByIdAndUserId(apiKeyId: string, userId: string): void {
    this.dslRW.deleteFrom(this.uak).where(this.uak.ID.eq(apiKeyId)).and(this.uak.USER_ID.eq(userId)).execute()
  }

  deleteApiKeyByUserId(userId: string): void {
    this.dslRW.deleteFrom(this.uak).where(this.uak.USER_ID.eq(userId)).execute()
  }

  findAnnouncementIdsReadByUserId(userId: string): Set<string> {
    return this.dslRO.select(this.ar.ANNOUNCEMENT_ID).from(this.ar).where(this.ar.USER_ID.eq(userId)).fetchSet(this.ar.ANNOUNCEMENT_ID)
  }

  existsByEmailIgnoreCase(email: string): boolean {
    return this.dslRO.fetchExists(this.dslRO.selectFrom(this.u).where(this.u.EMAIL.equalIgnoreCase(email)))
  }

  existsApiKeyByIdAndUserId(apiKeyId: string, userId: string): boolean {
    return this.dslRO.fetchExists(this.uak, this.uak.ID.eq(apiKeyId).and(this.uak.USER_ID.eq(userId)))
  }

  existsApiKeyByCommentAndUserId(comment: string, userId: string): boolean {
    return this.dslRO.fetchExists(this.uak, this.uak.COMMENT.equalIgnoreCase(comment).and(this.uak.USER_ID.eq(userId)))
  }

  findByEmailIgnoreCaseOrNull(email: string): KomgaUser | null {
    return firstOrNull(this.fetchAndMap(this.selectBase(this.dslRO).where(this.u.EMAIL.equalIgnoreCase(email)), this.dslRO))
  }

  // PORT: Pair<KomgaUser, ApiKey> -> tuple
  findByApiKeyOrNull(apiKey: string): [KomgaUser, ApiKey] | null {
    const user = firstOrNull(
      this.fetchAndMap(
        this.selectBase(this.dslRO).leftJoin(this.uak).on(this.u.ID.eq(this.uak.USER_ID)).where(this.uak.API_KEY.eq(apiKey)),
        this.dslRO,
      ),
    )
    if (user === null) return null

    const key = firstOrNull(
      this.dslRO
        .selectFrom(this.uak)
        .where(this.uak.API_KEY.eq(apiKey))
        .fetchInto(this.uak)
        .map((it) => this.toDomain(it)),
    )
    if (key === null) return null

    return [user, key]
  }

  private toDomain(self: UserApiKeyRecord): ApiKey {
    return new ApiKey({
      id: self.id,
      userId: self.userId,
      key: self.apiKey,
      comment: self.comment,
      createdDate: toCurrentTimeZone(self.createdDate),
      lastModifiedDate: toCurrentTimeZone(self.lastModifiedDate),
    })
  }
}

component(KomgaUserDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }],
  types: [KomgaUserRepository],
})
