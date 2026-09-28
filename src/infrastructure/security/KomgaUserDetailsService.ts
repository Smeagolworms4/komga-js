// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/KomgaUserDetailsService.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KomgaUserRepository } from '../../domain/persistence/KomgaUserRepository.js'
import { type UserDetails, UserDetailsService, UsernameNotFoundException } from '../../port/spring-security.js'
import { component } from '../../port/spring.js'
import { KomgaPrincipal } from './KomgaPrincipal.js'

export class KomgaUserDetailsService extends UserDetailsService {
  constructor(private readonly userRepository: KomgaUserRepository) {
    super()
  }

  loadUserByUsername(username: string): UserDetails {
    const it = this.userRepository.findByEmailIgnoreCaseOrNull(username)
    if (it !== null) return new KomgaPrincipal(it)
    throw new UsernameNotFoundException(username)
  }
}

// @Component
component(KomgaUserDetailsService, { inject: [KomgaUserRepository] })
