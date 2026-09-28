// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/OAuth2ControllerOracleTest.kt
import { OAuth2Controller } from '../../../../../src/interfaces/api/rest/OAuth2Controller.js'
import { ClientRegistration, InMemoryClientRegistrationRepository, ProviderDetails } from '../../../../../src/port/spring-security-oauth2.js'
import { oracle } from '../../../oracle.js'

const { func, kase } = oracle('interfaces/api/rest/OAuth2Controller')

const reg = (id: string, name: string) =>
  new ClientRegistration(
    id,
    `client-${id}`,
    '',
    'client_secret_basic',
    'authorization_code',
    '{baseUrl}/login/oauth2/code/{registrationId}',
    new Set(),
    new ProviderDetails(`https://auth/${id}`, `https://token/${id}`, { uri: '', authenticationMethod: 'header', userNameAttributeName: '' }, '', null, {}),
    name,
  )

func('getOAuth2Providers', () => {
  kase('no repository', () => new OAuth2Controller(null).getOAuth2Providers())
  kase('one provider', () => new OAuth2Controller(new InMemoryClientRegistrationRepository([reg('github', 'GitHub')])).getOAuth2Providers())
  kase('several providers', () =>
    new OAuth2Controller(new InMemoryClientRegistrationRepository([reg('zeta', 'Zeta'), reg('alpha', 'Alpha Provider'), reg('google', 'Google')])).getOAuth2Providers(),
  )
})
