// @port-of komga/src/test/kotlin/org/gotson/komga/domain/service/KomgaUserLifecycleTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
// PORT: équivalent du scan de composants : modules des beans nécessaires
import '../../../src/infrastructure/jooq/main/KomgaUserDao.js'
import '../../../src/infrastructure/jooq/main/ReadProgressDao.js'
import '../../../src/infrastructure/jooq/main/AuthenticationActivityDao.js'
import '../../../src/infrastructure/jooq/main/SyncPointDao.js'
import '../../../src/infrastructure/jooq/main/ClientSettingsDtoDao.js'
import '../../../src/infrastructure/security/PasswordEncoderConfiguration.js'
import '../../../src/infrastructure/security/session/SessionConfiguration.js'
import '../../../src/infrastructure/transaction/TransactionConfiguration.js'
import '../../../src/domain/service/KomgaUserLifecycle.js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DuplicateNameException } from '../../../src/domain/model/Exceptions.js'
import { KomgaUser } from '../../../src/domain/model/KomgaUser.js'
import { KomgaUserRepository } from '../../../src/domain/persistence/KomgaUserRepository.js'
import { KomgaUserLifecycle } from '../../../src/domain/service/KomgaUserLifecycle.js'
import { ApiKeyGenerator } from '../../../src/infrastructure/security/apikey/ApiKeyGenerator.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'
import { clearMocks, every } from '../../support/mockk.js'

describe('KomgaUserLifecycleTest', () => {
  // @SpykBean private lateinit var apiKeyGenerator: ApiKeyGenerator
  const ctx = springBootTest({}, [{ type: ApiKeyGenerator, spyk: true }])
  const userRepository = ctx.getBean(KomgaUserRepository)
  const userLifecycle = ctx.getBean(KomgaUserLifecycle)
  const apiKeyGenerator = ctx.getBean(ApiKeyGenerator)
  afterAll(() => closeContext(ctx))

  const user1 = new KomgaUser({ email: 'user1@example.org', password: '' })
  const user2 = new KomgaUser({ email: 'user2@example.org', password: '' })

  beforeAll(() => {
    userRepository.insert(user1)
    userRepository.insert(user2)
  })

  afterEach(() => {
    userRepository.deleteApiKeyByUserId(user1.id)
    userRepository.deleteApiKeyByUserId(user2.id)
  })

  // PORT: springmockk réinitialise les @SpykBean après chaque test (MockkClear.AFTER)
  afterEach(() => clearMocks(apiKeyGenerator))

  afterAll(() => {
    userRepository.deleteAll()
  })

  it('given existing api key when api key cannot be uniquely generated then it returns null', () => {
    // given
    const uuid = new ApiKeyGenerator().generate()
    every(() => apiKeyGenerator.generate()).returns(uuid)
    userLifecycle.createApiKey(user1, 'test key')

    // when
    const apiKey = userLifecycle.createApiKey(user1, 'test key 2')
    const apiKey2 = userLifecycle.createApiKey(user2, 'test key 3')

    // then
    expect(apiKey).toBeNull()
    expect(apiKey2).toBeNull()
  })

  it.each(['test', 'TEST', ' test '])('given existing api key comment when api key with same comment is generated then it throws exception', (comment) => {
    // given
    userLifecycle.createApiKey(user1, 'test')

    // when
    let thrown: unknown = null
    try {
      userLifecycle.createApiKey(user1, comment)
    } catch (e) {
      thrown = e
    }

    // then
    expect((thrown as object).constructor).toBe(DuplicateNameException)
  })
})
