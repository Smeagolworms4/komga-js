// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/jooq/main/ClientSettingsDtoDaoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import '../../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import '../../../../src/infrastructure/jooq/main/ClientSettingsDtoDao.js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { KomgaUserRepository } from '../../../../src/domain/persistence/KomgaUserRepository.js'
import { ClientSettingsDtoDao } from '../../../../src/infrastructure/jooq/main/ClientSettingsDtoDao.js'
import { ClientSettingDto } from '../../../../src/interfaces/api/rest/dto/ClientSettingDto.js'
import { eq } from '../../../../src/port/kotlin.js'
import { closeContext, springBootTest } from '../../../SpringBootTest.js'

/** `assertThat(map).containsAllEntriesOf(expected)` */
function expectContainsAllEntriesOf<K, V>(actual: Map<K, V>, expected: Map<K, V>): void {
  for (const [k, v] of expected) {
    expect(actual.has(k), `contains key ${String(k)}`).toBe(true)
    expect(eq(actual.get(k), v), `entry ${String(k)}`).toBe(true)
  }
}

describe('ClientSettingsDtoDaoTest', () => {
  const ctx = springBootTest()
  const clientSettingsDtoDao = ctx.getBean(ClientSettingsDtoDao)
  const userRepository = ctx.getBean(KomgaUserRepository)

  const user1 = new KomgaUser({ email: 'user1@example.org', password: '' })
  const user2 = new KomgaUser({ email: 'user2@example.org', password: '' })

  beforeAll(() => {
    userRepository.insert(user1)
    userRepository.insert(user2)
  })

  afterEach(() => {
    clientSettingsDtoDao.deleteAll()
  })

  afterAll(() => {
    userRepository.deleteAll()
    closeContext(ctx)
  })

  describe('Global', () => {
    it('when saving global setting then it is persisted', () => {
      clientSettingsDtoDao.saveGlobal('setting1', 'value1', true)
      clientSettingsDtoDao.saveGlobal('setting2', 'value2', false)

      const fetch = clientSettingsDtoDao.findAllGlobal()

      expectContainsAllEntriesOf(
        fetch,
        new Map([
          ['setting1', new ClientSettingDto({ value: 'value1', allowUnauthorized: true })],
          ['setting2', new ClientSettingDto({ value: 'value2', allowUnauthorized: false })],
        ]),
      )
    })

    it('given existing global setting when saving global setting then it is updated', () => {
      clientSettingsDtoDao.saveGlobal('setting1', 'value1', true)
      clientSettingsDtoDao.saveGlobal('setting1', 'updated', true)
      const fetch = clientSettingsDtoDao.findAllGlobal()

      expectContainsAllEntriesOf(fetch, new Map([['setting1', new ClientSettingDto({ value: 'updated', allowUnauthorized: true })]]))
    })

    it('given existing global setting when deleting global setting then it is deleted', () => {
      clientSettingsDtoDao.saveGlobal('setting1', 'value1', true)

      clientSettingsDtoDao.deleteGlobalByKeys(['setting1'])

      const fetch = clientSettingsDtoDao.findAllGlobal()

      expect(fetch.size).toBe(0)
    })
  })

  describe('User', () => {
    it('when saving user setting then it is persisted', () => {
      clientSettingsDtoDao.saveForUser(user1.id, 'setting1', 'value1')
      clientSettingsDtoDao.saveForUser(user2.id, 'setting2', 'value2')

      const fetch = clientSettingsDtoDao.findAllUser(user1.id)

      expectContainsAllEntriesOf(fetch, new Map([['setting1', new ClientSettingDto({ value: 'value1', allowUnauthorized: null })]]))
    })

    it('given existing user setting when saving user setting then it is updated', () => {
      clientSettingsDtoDao.saveForUser(user1.id, 'setting1', 'value1')
      clientSettingsDtoDao.saveForUser(user1.id, 'setting1', 'updated')

      const fetch = clientSettingsDtoDao.findAllUser(user1.id)

      expectContainsAllEntriesOf(fetch, new Map([['setting1', new ClientSettingDto({ value: 'updated', allowUnauthorized: null })]]))
    })

    it('given existing user setting when deleting user setting then it is deleted', () => {
      clientSettingsDtoDao.saveForUser(user1.id, 'setting1', 'value1')

      clientSettingsDtoDao.deleteByUserIdAndKeys(user1.id, ['setting1'])

      const fetch = clientSettingsDtoDao.findAllUser(user1.id)

      expect(fetch.size).toBe(0)
    })
  })
})
