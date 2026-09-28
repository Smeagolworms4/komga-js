// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/oauth2/KomgaOAuth2UserServiceConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KomgaUser } from '../../../domain/model/KomgaUser.js'
import { KomgaUserRepository } from '../../../domain/persistence/KomgaUserRepository.js'
import { KomgaUserLifecycle } from '../../../domain/service/KomgaUserLifecycle.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { RandomStringUtils } from '../../../port/commons-lang.js'
import { KotlinLogging } from '../../../port/logging.js'
import {
  DefaultOAuth2UserService,
  OAuth2AuthenticationException,
  type OAuth2User,
  type OAuth2UserRequest,
  OAuth2UserService,
  type OidcUser,
  type OidcUserRequest,
  OidcUserService,
} from '../../../port/spring-security-oauth2.js'
import { configuration } from '../../../port/spring.js'
import { KomgaPrincipal } from '../KomgaPrincipal.js'
import { GithubOAuth2UserService } from './GithubOAuth2UserService.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.security.oauth2.KomgaOAuth2UserServiceConfiguration')

export class KomgaOAuth2UserServiceConfiguration {
  constructor(
    private readonly userRepository: KomgaUserRepository,
    private readonly userLifecycle: KomgaUserLifecycle,
    private readonly komgaProperties: KomgaProperties,
  ) {}

  oauth2UserService(): OAuth2UserService<OAuth2UserRequest, OAuth2User> {
    const defaultDelegate = new DefaultOAuth2UserService()
    const githubDelegate = new GithubOAuth2UserService()

    // PORT: async (loadUser fait des requêtes HTTP)
    return new OAuth2UserService<OAuth2UserRequest, OAuth2User>(async (userRequest: OAuth2UserRequest) => {
      let delegate: DefaultOAuth2UserService
      switch (userRequest.clientRegistration.registrationId.toLowerCase()) {
        case 'github':
          delegate = githubDelegate
          break
        default:
          delegate = defaultDelegate
      }

      const oAuth2User = await delegate.loadUser(userRequest)

      const email = oAuth2User.getAttribute<string>('email')
      if (email === null) throw new OAuth2AuthenticationException('ERR_1024')

      const existingUser = this.userRepository.findByEmailIgnoreCaseOrNull(email) ?? this.tryCreateNewUser(email)

      return new KomgaPrincipal(existingUser, { oAuth2User: oAuth2User })
    })
  }

  oidcUserService(): OAuth2UserService<OidcUserRequest, OidcUser> {
    const delegate = new OidcUserService()
    // PORT: async (loadUser fait des requêtes HTTP)
    return new OAuth2UserService<OidcUserRequest, OidcUser>(async (userRequest: OidcUserRequest) => {
      const oidcUser = await delegate.loadUser(userRequest)

      if (oidcUser.email === null) throw new OAuth2AuthenticationException('ERR_1028')
      if (this.komgaProperties.oidcEmailVerification && oidcUser.emailVerified === null) throw new OAuth2AuthenticationException('ERR_1027')
      if (this.komgaProperties.oidcEmailVerification && oidcUser.emailVerified === false) throw new OAuth2AuthenticationException('ERR_1026')

      const existingUser = this.userRepository.findByEmailIgnoreCaseOrNull(oidcUser.email) ?? this.tryCreateNewUser(oidcUser.email)

      // UPSTREAM-BUG: KomgaPrincipal(existingUser, oidcUser) passe oidcUser en 2e position, c'est-à-dire comme oAuth2User
      return new KomgaPrincipal(existingUser, { oAuth2User: oidcUser })
    })
  }

  private tryCreateNewUser(email: string): KomgaUser {
    if (this.komgaProperties.oauth2AccountCreation) {
      logger.info(() => `Creating new user from OAuth2 login: ${email}`)
      return this.userLifecycle.createUser(new KomgaUser({ email: email, password: RandomStringUtils.secure().nextAlphanumeric(12) }))
    } else {
      throw new OAuth2AuthenticationException('ERR_1025')
    }
  }
}

// @Configuration
configuration(KomgaOAuth2UserServiceConfiguration, {
  inject: [KomgaUserRepository, KomgaUserLifecycle, KomgaProperties],
  beans: [
    { method: 'oauth2UserService', type: OAuth2UserService },
    { method: 'oidcUserService', type: OAuth2UserService },
  ],
})
