// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/PasswordEncoderConfiguration.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { BCryptPasswordEncoder, PasswordEncoder, Sha512DigestUtils } from '../../port/spring-security.js'
import { configuration } from '../../port/spring.js'
import { TokenEncoder } from './TokenEncoder.js'

export class PasswordEncoderConfiguration {
  getPasswordEncoder(): PasswordEncoder {
    return new BCryptPasswordEncoder()
  }

  getTokenEncoder(): TokenEncoder {
    return new TokenEncoder((rawPassword) => Sha512DigestUtils.shaHex(rawPassword))
  }
}

// @Configuration
configuration(PasswordEncoderConfiguration, {
  beans: [
    { method: 'getPasswordEncoder', type: PasswordEncoder },
    { method: 'getTokenEncoder', type: TokenEncoder },
  ],
})
