// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/apikey/ApiKeyAuthenticationFilter.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import type { FilterChain, HttpServletRequest, HttpServletResponse } from '../../../port/servlet.js'
import {
  AnonymousAuthenticationToken,
  type Authentication,
  AuthenticationException,
  type AuthenticationManager,
  SecurityContextHolder,
  type SecurityContextHolderStrategy,
} from '../../../port/spring-security.js'
import {
  type AuthenticationConverter,
  AuthenticationEntryPointFailureHandler,
  type AuthenticationFailureHandler,
  HttpStatusEntryPoint,
  RequestAttributeSecurityContextRepository,
  type SecurityContextRepository,
} from '../../../port/spring-security-web.js'
import { HttpStatus } from '../../../port/spring-web.js'
import { OncePerRequestFilter } from '../../../port/spring-web-filter.js'
import { ApiKeyAuthenticationToken } from './ApiKeyAuthenticationToken.js'

export class ApiKeyAuthenticationFilter extends OncePerRequestFilter {
  private readonly securityContextHolderStrategy: SecurityContextHolderStrategy = SecurityContextHolder.getContextHolderStrategy()

  private readonly securityContextRepository: SecurityContextRepository = new RequestAttributeSecurityContextRepository()

  private readonly failureHandler: AuthenticationFailureHandler = new AuthenticationEntryPointFailureHandler(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))

  constructor(
    private readonly authenticationManager: AuthenticationManager,
    private readonly authenticationConverter: AuthenticationConverter,
  ) {
    super()
  }

  // PORT: async (la suite de la chaîne de filtres est asynchrone)
  protected override async doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, filterChain: FilterChain): Promise<void> {
    try {
      const authRequest = this.authenticationConverter.convert(request)
      if (authRequest === null) {
        await filterChain.doFilter(request, response)
        return
      }
      if (this.authenticationIsRequired(authRequest.name)) {
        // PORT: async (AuthenticationManager.authenticate)
        const authResult = await this.authenticationManager.authenticate(authRequest)
        if (authResult === null) {
          await filterChain.doFilter(request, response)
          return
        }
        this.successfulAuthentication(request, response, filterChain, authResult)
      }
    } catch (ex) {
      if (!(ex instanceof AuthenticationException)) throw ex
      await this.unsuccessfulAuthentication(request, response, ex)
    }

    await filterChain.doFilter(request, response)
  }

  private async unsuccessfulAuthentication(request: HttpServletRequest, response: HttpServletResponse, failed: AuthenticationException): Promise<void> {
    this.securityContextHolderStrategy.clearContext()
    await this.failureHandler.onAuthenticationFailure(request, response, failed)
  }

  private successfulAuthentication(request: HttpServletRequest, response: HttpServletResponse, _filterChain: FilterChain, authentication: Authentication): void {
    const context = this.securityContextHolderStrategy.createEmptyContext()
    context.authentication = authentication
    this.securityContextHolderStrategy.context = context
    this.securityContextRepository.saveContext(context, request, response)

    // Explicitly tell SessionManagementFilter to skip execution for this request thread, else it will create a session in the session registry
    request.setAttribute('__spring_security_session_mgmt_filter_applied', true)
  }

  private authenticationIsRequired(username: string): boolean {
    // Only reauthenticate if username doesn't match SecurityContextHolder and user isn't authenticated
    const existingAuth = this.securityContextHolderStrategy.context.authentication
    if (existingAuth === null || existingAuth.name !== username || !existingAuth.isAuthenticated) {
      return true
    }
    // Handle unusual condition where an AnonymousAuthenticationToken is already
    // present. This shouldn't happen very often, as ApiKeyAuthenticationFilter is
    // meant to be earlier in the filter chain than AnonymousAuthenticationFilter.
    // Also check that the existing token is of type ApiKeyAuthenticationToken.
    // This would prevent reusing a session obtained from Basic Auth for example.
    return existingAuth instanceof AnonymousAuthenticationToken || !(existingAuth instanceof ApiKeyAuthenticationToken)
  }
}
