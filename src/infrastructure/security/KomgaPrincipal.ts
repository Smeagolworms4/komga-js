// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/KomgaPrincipal.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ApiKey } from '../../domain/model/ApiKey.js'
import type { KomgaUser } from '../../domain/model/KomgaUser.js'
import { type GrantedAuthority, SimpleGrantedAuthority, type UserDetails, distinctAuthorities } from '../../port/spring-security.js'
import { type OAuth2User, type OidcIdToken, type OidcUser, type OidcUserInfo, claimAsBoolean, claimAsString } from '../../port/spring-security-oauth2.js'

export class KomgaPrincipal implements UserDetails, OAuth2User, OidcUser {
  readonly oAuth2User: OAuth2User | null
  readonly oidcUser: OidcUser | null
  readonly apiKey: ApiKey | null
  private readonly name: string

  constructor(
    readonly user: KomgaUser,
    {
      oAuth2User = null,
      oidcUser = null,
      apiKey = null,
      name = user.email,
    }: { oAuth2User?: OAuth2User | null; oidcUser?: OidcUser | null; apiKey?: ApiKey | null; name?: string } = {},
  ) {
    this.oAuth2User = oAuth2User
    this.oidcUser = oidcUser
    this.apiKey = apiKey
    this.name = name
  }

  getAuthorities(): GrantedAuthority[] {
    // PORT: toMutableSet() -> autorités distinctes
    return distinctAuthorities([...this.user.roles].map((it) => new SimpleGrantedAuthority(`ROLE_${it.name}`)))
  }

  isEnabled(): boolean {
    return true
  }

  getUsername(): string {
    return this.name
  }

  isCredentialsNonExpired(): boolean {
    return true
  }

  getPassword(): string {
    return this.user.password
  }

  isAccountNonExpired(): boolean {
    return true
  }

  isAccountNonLocked(): boolean {
    return true
  }

  getName(): string {
    return this.name
  }

  getAttributes(): Record<string, unknown> {
    return this.oAuth2User?.getAttributes() ?? {}
  }

  getClaims(): Record<string, unknown> {
    return this.oidcUser?.getClaims() ?? {}
  }

  getUserInfo(): OidcUserInfo | null {
    return this.oidcUser?.getUserInfo() ?? null
  }

  getIdToken(): OidcIdToken | null {
    return this.oidcUser?.getIdToken() ?? null
  }

  // PORT: méthodes par défaut héritées des interfaces Java (OAuth2AuthenticatedPrincipal.getAttribute, StandardClaimAccessor)
  getAttribute<A = unknown>(name: string): A | null {
    return (this.getAttributes()[name] as A | undefined) ?? null
  }

  get email(): string | null {
    return claimAsString(this.getClaims(), 'email')
  }

  get emailVerified(): boolean | null {
    return claimAsBoolean(this.getClaims(), 'email_verified')
  }
}
