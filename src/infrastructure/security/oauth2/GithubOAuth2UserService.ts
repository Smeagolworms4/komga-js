// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/oauth2/GithubOAuth2UserService.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { intersect, require } from '../../../port/kotlin.js'
import { KotlinLogging } from '../../../port/logging.js'
import { DefaultOAuth2User, DefaultOAuth2UserService, type OAuth2User, type OAuth2UserRequest } from '../../../port/spring-security-oauth2.js'
import { RestClientResponseException } from '../../../port/spring-web.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.security.oauth2.GithubOAuth2UserService')

export class GithubOAuth2UserService extends DefaultOAuth2UserService {
  private readonly emailScopes = ['user:email', 'user']

  // PORT: parameterizedResponseType (ParameterizedTypeReference<List<Map<String, Any>>>) : réponse JSON lue telle quelle

  // PORT: async (requêtes HTTP)
  override async loadUser(userRequest: OAuth2UserRequest | null): Promise<OAuth2User> {
    require(userRequest !== null, () => 'userRequest cannot be null')

    let oAuth2User = await super.loadUser(userRequest)

    if (intersect(userRequest.clientRegistration.scopes, this.emailScopes).size > 0 && oAuth2User.getAttribute<string>('email') === null) {
      try {
        // PORT: RestTemplate().exchange(RequestEntity(GET, Bearer), ...) -> fetch ; statut non 2xx = exception
        const res = await fetch(`${userRequest.clientRegistration.providerDetails.userInfoEndpoint.uri}/emails`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${userRequest.accessToken.tokenValue}`, Accept: 'application/json, application/*+json' },
        })
        if (!res.ok) throw new RestClientResponseException(`${res.status} ${res.statusText}`)
        const body = (await res.json()) as Record<string, unknown>[] | null
        let email: string | null = null
        if (body !== null) {
          const emails = body.filter((it) => it.verified === true).filter((it) => it.primary === true)
          // firstNotNullOfOrNull { it["email"].toString() } : toString() d'une valeur nulle donne "null"
          for (const it of emails) {
            email = it.email === null || it.email === undefined ? 'null' : String(it.email)
            break
          }
        }
        oAuth2User = new DefaultOAuth2User(
          oAuth2User.getAuthorities(),
          { ...oAuth2User.getAttributes(), email: email },
          userRequest.clientRegistration.providerDetails.userInfoEndpoint.userNameAttributeName,
        )
      } catch (e) {
        logger.warn(() => 'Could not retrieve emails')
      }
    }

    return oAuth2User
  }
}
