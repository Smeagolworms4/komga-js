// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/security/TokenEncoder.kt@65981e600edb24944ffaae4818ff2716a5fa08dd

/**
 * Service interface for encoding tokens.
 * Contrary to password encoding, token encoding is deterministic, so that lookups can be done using
 * only the token, without a username.
 */
// PORT: fun interface -> classe construite avec la lambda (le constructeur SAM `TokenEncoder { }` devient `new TokenEncoder(...)`)
export class TokenEncoder {
  constructor(readonly encode: (rawPassword: string) => string) {}
}
