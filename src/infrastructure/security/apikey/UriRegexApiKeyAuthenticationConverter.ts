// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/apikey/UriRegexApiKeyAuthenticationConverter.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Hasher } from '../../hash/Hasher.js'
import type { HttpServletRequest } from '../../../port/servlet.js'
import type { Authentication, AuthenticationDetailsSource } from '../../../port/spring-security.js'
import type { AuthenticationConverter } from '../../../port/spring-security-web.js'
import type { TokenEncoder } from '../TokenEncoder.js'
import { ApiKeyAuthenticationToken } from './ApiKeyAuthenticationToken.js'

/**
 * A strategy that uses a regex to retrieve the API key from the
 * request URI, and convert it to an [ApiKeyAuthenticationToken]
 *
 * @property tokenRegex the regex used to extract the API key
 * @property hasher the hasher to use to encode the API key as username in the [Authentication] object
 * @property tokenEncoder the encoder to use to encode the API key as credentials in the [Authentication] object
 * @property authenticationDetailsSource the [AuthenticationDetailsSource] to enrich the [Authentication] details
 */
export class UriRegexApiKeyAuthenticationConverter implements AuthenticationConverter {
  constructor(
    private readonly tokenRegex: RegExp,
    private readonly hasher: Hasher,
    private readonly tokenEncoder: TokenEncoder,
    private readonly authenticationDetailsSource: AuthenticationDetailsSource,
  ) {}

  convert(request: HttpServletRequest): Authentication | null {
    const uri = request.requestURI
    // tokenRegex.find(it)?.groupValues?.lastOrNull()
    const m = uri !== null ? this.tokenRegex.exec(uri) : null
    // PORT: groupValues donne "" pour un groupe non capturé
    const it = m !== null ? (m[m.length - 1] ?? '') : null
    if (it === null) return null
    // PORT: Hasher.computeHash(String) -> computeHashOfString
    const maskedToken = this.hasher.computeHashOfString(it)
    const hashedToken = this.tokenEncoder.encode(it)
    const token = ApiKeyAuthenticationToken.unauthenticated(maskedToken, hashedToken)
    token.details = this.authenticationDetailsSource.buildDetails(request)
    return token
  }
}
