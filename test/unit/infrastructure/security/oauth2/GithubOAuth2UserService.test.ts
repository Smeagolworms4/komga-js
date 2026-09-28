// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/oauth2/GithubOAuth2UserServiceOracleTest.kt
import { GithubOAuth2UserService } from '../../../../../src/infrastructure/security/oauth2/GithubOAuth2UserService.js'
import { oracle } from '../../../oracle.js'
import { FakeIdentityProvider } from './support.js'

const { func, kase } = oracle('infrastructure/security/oauth2/GithubOAuth2UserService')

const idp = new FakeIdentityProvider()
const service = new GithubOAuth2UserService()

async function load(...scopes: string[]): Promise<unknown> {
  await idp.start()
  let result: unknown
  try {
    result = idp.describe(await service.loadUser(idp.request(idp.registration('github', '/user', 'login', ...scopes))))
  } catch (e) {
    result = idp.describeError(e)
  }
  return [result, idp.drain()]
}

func('loadUser', () => {
  kase('email in profile', () => {
    idp.responses.set('/user', [200, '{"login":"gh","id":1,"email":"gh@example.org"}'])
    return load('user:email')
  })
  kase('email from emails endpoint', () => {
    idp.responses.set('/user', [200, '{"login":"gh","id":1,"email":null}'])
    idp.responses.set('/user/emails', [
      200,
      '[{"email":"a@x.org","verified":true,"primary":false},{"email":"b@x.org","verified":false,"primary":true},{"email":"c@x.org","verified":true,"primary":true}]',
    ])
    return load('user:email', 'read:user')
  })
  kase('no verified primary email', () => {
    idp.responses.set('/user/emails', [200, '[{"email":"a@x.org","verified":true,"primary":false}]'])
    return load('user')
  })
  kase('emails endpoint failure', () => {
    idp.responses.set('/user/emails', [500, '{}'])
    return load('user:email')
  })
  kase('no email scope', () => load('read:user'))
  kase('profile failure', () => {
    idp.responses.set('/user', [401, '{"message":"Bad credentials"}'])
    return load('user:email')
  })
  kase('null request', async () => {
    try {
      return await service.loadUser(null)
    } catch (e) {
      return idp.describeError(e)
    }
  })
  kase('stop', () => idp.stop())
})
