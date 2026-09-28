// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/kobo/KomgaSyncTokenGenerator.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { KomgaSyncToken } from '../../domain/model/KomgaSyncToken.js'
import { ObjectMapper, javaDoubleToString } from '../../port/jackson-mapper.js'
import { JsonNumber, type JsonNode } from '../../port/jackson-tree.js'
import { NullPointerException } from '../../port/kotlin.js'
import { KotlinLogging } from '../../port/logging.js'
import type { HttpServletRequest } from '../../port/servlet.js'
import { component } from '../../port/spring.js'
import { javaBase64Decode } from '../../port/spring-session.js'
import { KoboHeaders } from './KoboHeaders.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.kobo.KomgaSyncTokenGenerator')

const KOMGA_TOKEN_PREFIX = 'KOMGA.'

export class KomgaSyncTokenGenerator {
  constructor(private readonly objectMapper: ObjectMapper) {}

  // PORT: Base64.getEncoder().withoutPadding()
  private base64Encoder = { encodeToString: (b: Uint8Array): string => Buffer.from(b).toString('base64').replace(/=+$/, '') }

  // PORT: Base64.getDecoder() (strict : IllegalArgumentException si l'entrée n'est pas du Base64 valide)
  private base64Decoder = {
    decode: (s: string): string => {
      const decoded = javaBase64Decode(s)
      if (decoded === null) throw new Error('Illegal base64 character')
      return decoded
    },
  }

  /**
   * Convert any SyncToken to a [KomgaSyncToken].
   * The input SyncToken type depends on the String format:
   * - the official Kobo store token is of the form `base64.base64`
   * - the Calibre Web token is a single base64 string
   * - the Komga token is a base64 string prefixed by `KOMGA.`
   */
  fromBase64(base64Token: string): KomgaSyncToken {
    try {
      // check for a Komga token
      if (base64Token.startsWith(KOMGA_TOKEN_PREFIX)) {
        return this.objectMapper.readValue<KomgaSyncToken>(this.base64Decoder.decode(base64Token.slice(KOMGA_TOKEN_PREFIX.length)), { class: KomgaSyncToken })
      }

      // check for a Calibre Web token
      if (!base64Token.includes('.')) {
        try {
          const json = this.objectMapper.readTree(this.base64Decoder.decode(base64Token))
          const koboToken = asText(get(get(json, 'data'), 'raw_kobo_store_token'))
          return new KomgaSyncToken({ rawKoboSyncToken: koboToken })
        } catch {
          logger.warn(() => 'Failed to parse potential CalibreWeb token')
        }
      }

      // check for a Kobo store token
      if (base64Token.includes('.')) {
        return new KomgaSyncToken({ rawKoboSyncToken: base64Token })
      }
    } catch {}

    // in last resort return a default token
    return new KomgaSyncToken()
  }

  toBase64(token: KomgaSyncToken): string {
    return KOMGA_TOKEN_PREFIX + this.base64Encoder.encodeToString(Buffer.from(this.objectMapper.writeValueAsString(token), 'utf8'))
  }

  fromRequestHeaders(request: HttpServletRequest): KomgaSyncToken | null {
    const syncTokenB64 = request.getHeader(KoboHeaders.X_KOBO_SYNCTOKEN)
    return syncTokenB64 !== null ? this.fromBase64(syncTokenB64) : null
  }
}

// PORT: JsonNode.get(fieldName) : null si le nœud n'est pas un objet ou n'a pas le champ ; NullPointerException sur un nœud null (Kotlin)
function get(node: JsonNode | undefined, field: string): JsonNode | undefined {
  if (node === undefined) throw new NullPointerException()
  if (node instanceof Map) return node.get(field)
  return undefined
}

// PORT: JsonNode.asText()
function asText(node: JsonNode | undefined): string {
  if (node === undefined) throw new NullPointerException()
  if (node === null) return 'null'
  if (typeof node === 'string') return node
  if (typeof node === 'boolean') return String(node)
  if (node instanceof JsonNumber) return node.kind === 'double' ? javaDoubleToString(Number(node.value)) : String(node.value)
  return ''
}

// @Component
component(KomgaSyncTokenGenerator, { inject: [ObjectMapper] })
