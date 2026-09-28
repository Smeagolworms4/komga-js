// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/KomgaUserDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/LibraryDao.js'
import '../../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import { LocalDateTime } from '@js-joda/core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AgeRestriction, AllowExclude } from '../../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../../src/domain/model/ContentRestrictions.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { UserRoles } from '../../../../src/domain/model/UserRoles.js'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { KomgaUserDao } from '../../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import { nn } from '../../../../src/port/kotlin.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'
import { makeLibrary } from '../../../domain/model/Utils.js'
import { expectCloseTo } from '../TestUtils.js'

describe('KomgaUserDaoTest', () => {
  const ctx = springBootTest()
  const komgaUserDao = ctx.getBean(KomgaUserDao)
  const libraryRepository = ctx.getBean(LibraryRepository)

  const library = makeLibrary()

  beforeAll(() => {
    libraryRepository.insert(library)
  })

  afterEach(() => {
    komgaUserDao.deleteAll()
    expect(komgaUserDao.count()).toBe(0)
  })

  afterAll(() => {
    libraryRepository.deleteAll()
    closeContext(ctx)
  })

  it('given a user when saving it then it is persisted', () => {
    const now = LocalDateTime.now()
    const user = new KomgaUser({
      email: 'user@example.org',
      password: 'password',
      sharedLibrariesIds: new Set([library.id]),
      sharedAllLibraries: false,
    })

    komgaUserDao.insert(user)
    const created = nn(komgaUserDao.findByIdOrNull(user.id))

    {
      const it = created
      expect(it.id).not.toBe(0)
      expectCloseTo(it.createdDate, now)
      expectCloseTo(it.lastModifiedDate, now)
      expect(it.email).toBe('user@example.org')
      expect(it.password).toBe('password')
      expect([...it.roles].map((r) => r.name).sort()).toEqual([UserRoles.FILE_DOWNLOAD, UserRoles.PAGE_STREAMING].map((r) => r.name).sort())
      expect([...it.sharedLibrariesIds]).toEqual([library.id])
      expect(it.sharedAllLibraries).toBe(false)
      expect(it.restrictions.ageRestriction).toBeNull()
      expect(it.restrictions.labelsAllow.size).toBe(0)
      expect(it.restrictions.labelsExclude.size).toBe(0)
    }
  })

  it('given existing user when modifying and saving it then it is persisted', () => {
    const user = new KomgaUser({
      email: 'user@example.org',
      password: 'password',
      sharedLibrariesIds: new Set([library.id]),
      sharedAllLibraries: false,
      restrictions: new ContentRestrictions({
        ageRestriction: new AgeRestriction({ age: 10, restriction: AllowExclude.ALLOW_ONLY }),
        labelsAllow: new Set(['allow']),
        labelsExclude: new Set(['exclude']),
      }),
    })

    komgaUserDao.insert(user)
    const created = nn(komgaUserDao.findByIdOrNull(user.id))
    {
      const it = created
      expect(it.restrictions.ageRestriction).not.toBeNull()
      expect(nn(it.restrictions.ageRestriction).age).toBe(10)
      expect(nn(it.restrictions.ageRestriction).restriction).toBe(AllowExclude.ALLOW_ONLY)
      expect([...it.restrictions.labelsAllow]).toEqual(['allow'])
      expect([...it.restrictions.labelsExclude]).toEqual(['exclude'])
    }

    const modified = created.copy({
      email: 'user2@example.org',
      password: 'password2',
      roles: new Set([UserRoles.ADMIN, UserRoles.FILE_DOWNLOAD, UserRoles.PAGE_STREAMING, UserRoles.KOBO_SYNC]),
      sharedLibrariesIds: new Set(),
      sharedAllLibraries: true,
      restrictions: new ContentRestrictions({
        ageRestriction: new AgeRestriction({ age: 16, restriction: AllowExclude.EXCLUDE }),
        labelsAllow: new Set(['allow2']),
        labelsExclude: new Set(['exclude2']),
      }),
    })
    const modifiedDate = LocalDateTime.now()
    komgaUserDao.update(modified)
    const modifiedSaved = nn(komgaUserDao.findByIdOrNull(modified.id))

    {
      const it = modifiedSaved
      expect(it.id).toBe(created.id)
      expect(it.createdDate.equals(created.createdDate)).toBe(true)
      expectCloseTo(it.lastModifiedDate, modifiedDate)
      expect(it.lastModifiedDate.equals(modified.createdDate)).toBe(false)
      expect(it.email).toBe('user2@example.org')
      expect(it.password).toBe('password2')
      expect([...it.roles].map((r) => r.name).sort()).toEqual(
        [UserRoles.ADMIN, UserRoles.FILE_DOWNLOAD, UserRoles.PAGE_STREAMING, UserRoles.KOBO_SYNC].map((r) => r.name).sort(),
      )
      expect(it.sharedLibrariesIds.size).toBe(0)
      expect(it.sharedAllLibraries).toBe(true)
      expect(it.restrictions.ageRestriction).not.toBeNull()
      expect(nn(it.restrictions.ageRestriction).age).toBe(16)
      expect(nn(it.restrictions.ageRestriction).restriction).toBe(AllowExclude.EXCLUDE)
      expect([...it.restrictions.labelsAllow]).toEqual(['allow2'])
      expect([...it.restrictions.labelsExclude]).toEqual(['exclude2'])
    }

    komgaUserDao.update(modifiedSaved.copy({ restrictions: new ContentRestrictions() }))
    {
      const it = nn(komgaUserDao.findByIdOrNull(modified.id))
      expect(it.restrictions.ageRestriction).toBeNull()
      expect(it.restrictions.labelsAllow.size).toBe(0)
      expect(it.restrictions.labelsExclude.size).toBe(0)
    }
  })

  it('given multiple users when saving then they are persisted', () => {
    komgaUserDao.insert(new KomgaUser({ email: 'user1@example.org', password: 'p' }))
    komgaUserDao.insert(new KomgaUser({ email: 'user2@example.org', password: 'p' }))

    const users = komgaUserDao.findAll()

    expect(users).toHaveLength(2)
    expect(users.map((it) => it.email).sort()).toEqual(['user1@example.org', 'user2@example.org'].sort())
  })

  it('given some users when counting then proper count is returned', () => {
    komgaUserDao.insert(new KomgaUser({ email: 'user1@example.org', password: 'p' }))
    komgaUserDao.insert(new KomgaUser({ email: 'user2@example.org', password: 'p' }))

    const count = komgaUserDao.count()

    expect(count).toBe(2)
  })

  it('given existing user when finding by id then user is returned', () => {
    const existing = new KomgaUser({ email: 'user1@example.org', password: 'p' })
    komgaUserDao.insert(existing)

    const user = komgaUserDao.findByIdOrNull(existing.id)

    expect(user).not.toBeNull()
  })

  it('given non-existent user when finding by id then null is returned', () => {
    const user = komgaUserDao.findByIdOrNull('38473')

    expect(user).toBeNull()
  })

  it('given existing user when deleting then user is deleted', () => {
    const existing = new KomgaUser({ email: 'user1@example.org', password: 'p' })
    komgaUserDao.insert(existing)

    komgaUserDao.delete(existing.id)

    expect(komgaUserDao.count()).toBe(0)
  })

  it('given users when checking if exists by email then return true or false', () => {
    komgaUserDao.insert(new KomgaUser({ email: 'user1@example.org', password: 'p' }))

    const exists = komgaUserDao.existsByEmailIgnoreCase('USER1@EXAMPLE.ORG')
    const notExists = komgaUserDao.existsByEmailIgnoreCase('USER2@EXAMPLE.ORG')

    expect(exists).toBe(true)
    expect(notExists).toBe(false)
  })

  it('given users when finding by email then return user', () => {
    komgaUserDao.insert(new KomgaUser({ email: 'user1@example.org', password: 'p' }))

    const found = komgaUserDao.findByEmailIgnoreCaseOrNull('USER1@EXAMPLE.ORG')
    const notFound = komgaUserDao.findByEmailIgnoreCaseOrNull('USER2@EXAMPLE.ORG')

    expect(found).not.toBeNull()
    expect(found?.email).toBe('user1@example.org')
    expect(notFound).toBeNull()
  })

  it('given user when saving announcement as read then it works', () => {
    const user = new KomgaUser({ email: 'user1@example.org', password: 'p' })
    komgaUserDao.insert(user)

    expect(komgaUserDao.findAnnouncementIdsReadByUserId(user.id).size).toBe(0)

    komgaUserDao.saveAnnouncementIdsRead(user, new Set(['1']))
    expect([...komgaUserDao.findAnnouncementIdsReadByUserId(user.id)].sort()).toEqual(['1'])

    komgaUserDao.saveAnnouncementIdsRead(user, new Set(['2']))
    expect([...komgaUserDao.findAnnouncementIdsReadByUserId(user.id)].sort()).toEqual(['1', '2'])

    komgaUserDao.saveAnnouncementIdsRead(user, new Set(['2']))
    expect([...komgaUserDao.findAnnouncementIdsReadByUserId(user.id)].sort()).toEqual(['1', '2'])
  })
})
