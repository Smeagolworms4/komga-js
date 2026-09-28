// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/MockSpringSecurity.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { AgeRestriction, AllowExclude } from '../../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../../src/domain/model/ContentRestrictions.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { UserRoles } from '../../../../src/domain/model/UserRoles.js'
import { KomgaPrincipal } from '../../../../src/infrastructure/security/KomgaPrincipal.js'
import { ApiKeyAuthenticationToken } from '../../../../src/infrastructure/security/apikey/ApiKeyAuthenticationToken.js'
import { SecurityContextHolder, UsernamePasswordAuthenticationToken, type SecurityContext } from '../../../../src/port/spring-security.js'
import { withSecurityContext } from '../../../support/mockmvc.js'

// PORT: annotation `@WithMockCustomUser(..)` (attributs avec valeurs par défaut) -> options de `withMockCustomUser(options, testFn)`,
// qui enveloppe le corps du test : `it('..', withMockCustomUser({ roles: ['ADMIN'] }, async () => { .. }))`
// (@WithSecurityContext(factory = WithMockCustomUserSecurityContextFactory::class, setupBefore = TestExecutionEvent.TEST_EXECUTION))
export type WithMockCustomUser = {
  email?: string
  roles?: string[]
  sharedAllLibraries?: boolean
  sharedLibraries?: string[]
  id?: string
  allowAgeUnder?: number
  excludeAgeOver?: number
  allowLabels?: string[]
  excludeLabels?: string[]
  apiKey?: string
}

/** Valeurs par défaut de l'annotation */
function withDefaults({
  email = 'user@example.org',
  roles = ['PAGE_STREAMING', 'FILE_DOWNLOAD', 'KOBO_SYNC'],
  sharedAllLibraries = true,
  sharedLibraries = [],
  id = '0',
  allowAgeUnder = -1,
  excludeAgeOver = -1,
  allowLabels = [],
  excludeLabels = [],
  apiKey = '',
}: WithMockCustomUser): Required<WithMockCustomUser> {
  return { email, roles, sharedAllLibraries, sharedLibraries, id, allowAgeUnder, excludeAgeOver, allowLabels, excludeLabels, apiKey }
}

export class WithMockCustomUserSecurityContextFactory {
  createSecurityContext(customUser: Required<WithMockCustomUser>): SecurityContext {
    const context = SecurityContextHolder.createEmptyContext()

    const principal = new KomgaPrincipal(
      new KomgaUser({
        email: customUser.email,
        password: '',
        roles: UserRoles.valuesOf([...customUser.roles]),
        sharedLibrariesIds: new Set(customUser.sharedLibraries),
        sharedAllLibraries: customUser.sharedAllLibraries,
        restrictions: new ContentRestrictions({
          ageRestriction:
            customUser.allowAgeUnder >= 0
              ? new AgeRestriction({ age: customUser.allowAgeUnder, restriction: AllowExclude.ALLOW_ONLY })
              : customUser.excludeAgeOver >= 0
                ? new AgeRestriction({ age: customUser.excludeAgeOver, restriction: AllowExclude.EXCLUDE })
                : null,
          labelsAllow: new Set(customUser.allowLabels),
          labelsExclude: new Set(customUser.excludeLabels),
        }),
        id: customUser.id,
      }),
    )
    const auth =
      customUser.apiKey.length > 0
        ? ApiKeyAuthenticationToken.authenticated(customUser.apiKey, customUser.apiKey, principal.getAuthorities())
        : new UsernamePasswordAuthenticationToken(principal, '', principal.getAuthorities())
    context.authentication = auth
    return context
  }
}

/** `@WithMockCustomUser` / `@WithMockCustomUser(..)` sur une méthode de test */
export function withMockCustomUser<A extends unknown[]>(customUser: WithMockCustomUser, fn: (...args: A) => unknown): (...args: A) => Promise<void>
export function withMockCustomUser<A extends unknown[]>(fn: (...args: A) => unknown): (...args: A) => Promise<void>
export function withMockCustomUser<A extends unknown[]>(a: WithMockCustomUser | ((...args: A) => unknown), b?: (...args: A) => unknown): (...args: A) => Promise<void> {
  const customUser = typeof a === 'function' ? {} : a
  const fn = (typeof a === 'function' ? a : b) as (...args: A) => unknown
  return withSecurityContext(() => new WithMockCustomUserSecurityContextFactory().createSecurityContext(withDefaults(customUser)), fn)
}
