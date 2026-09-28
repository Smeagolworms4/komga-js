// Support de portage : analyseur de java.net.URI (JDK 21, `URI.Parser`), portage à plat.
// Ce fichier n'a pas de jumeau Kotlin.
// `URI` de port/java-net.ts conserve la chaîne mais ne valide qu'une partie de la syntaxe et n'expose pas `host` :
// `parseJavaUri(str)` reproduit `new URI(str)` (URISyntaxException aux mêmes endroits) et renvoie les composants
// calculés par Java (`getHost()` en particulier : null pour une autorité « registry-based » ou un URI opaque).
// Équivalence vérifiée contre java.net.URI (jshell), voir test/port/java-uri.test.ts.
import { URI, URISyntaxException } from './java-net.js'

export type JavaUriParts = {
  scheme: string | null
  schemeSpecificPart: string | null
  authority: string | null
  userInfo: string | null
  host: string | null
  port: number
  path: string | null
  query: string | null
  fragment: string | null
}

const L_DIGIT = 0x3ff000000000000n
const H_DIGIT = 0n
const L_UPALPHA = 0n
const H_UPALPHA = 0x7fffffen
const L_LOWALPHA = 0n
const H_LOWALPHA = 0x7fffffe00000000n
const L_ALPHA = L_LOWALPHA | L_UPALPHA
const H_ALPHA = H_LOWALPHA | H_UPALPHA
const L_ALPHANUM = L_DIGIT | L_ALPHA
const H_ALPHANUM = H_DIGIT | H_ALPHA
const L_HEX = L_DIGIT
const H_HEX = 0x7e0000007en
const L_MARK = 0x678200000000n
const H_MARK = 0x4000000080000000n
const L_UNRESERVED = L_ALPHANUM | L_MARK
const H_UNRESERVED = H_ALPHANUM | H_MARK
const L_RESERVED = 0xac00985000000000n
const H_RESERVED = 0x28000001n
const L_ESCAPED = 1n
const H_ESCAPED = 0n
const L_URIC = L_RESERVED | L_UNRESERVED | L_ESCAPED
const H_URIC = H_RESERVED | H_UNRESERVED | H_ESCAPED
const L_PCHAR = L_UNRESERVED | L_ESCAPED | 0x2400185000000000n
const H_PCHAR = H_UNRESERVED | H_ESCAPED | 0x1n
const L_PATH = L_PCHAR | 0x800800000000000n
const H_PATH = H_PCHAR
const L_DASH = 0x200000000000n
const H_DASH = 0x0n
const L_DOT = 0x400000000000n
const H_DOT = 0x0n
const L_USERINFO = L_UNRESERVED | L_ESCAPED | 0x2c00185000000000n
const H_USERINFO = H_UNRESERVED | H_ESCAPED
const L_REG_NAME = L_UNRESERVED | L_ESCAPED | 0x2c00185000000000n
const H_REG_NAME = H_UNRESERVED | H_ESCAPED | 0x1n
const L_SERVER = L_USERINFO | L_ALPHANUM | L_DASH | 0x400400000000000n
const H_SERVER = H_USERINFO | H_ALPHANUM | H_DASH | 0x28000001n
const L_SERVER_PERCENT = L_SERVER | 0x2000000000n
const H_SERVER_PERCENT = H_SERVER
const L_SCHEME = L_ALPHA | L_DIGIT | 0x680000000000n
const H_SCHEME = H_ALPHA | H_DIGIT
const L_SCOPE_ID = L_ALPHANUM | 0x400000000000n
const H_SCOPE_ID = H_ALPHANUM | 0x80000000n

function match(c: number, lowMask: bigint, highMask: bigint): boolean {
  if (c === 0)
    // 0 doesn't have a slot in the mask. So, it never matches.
    return false
  if (c < 64) return ((1n << BigInt(c)) & lowMask) !== 0n
  if (c < 128) return ((1n << BigInt(c - 64)) & highMask) !== 0n
  return false
}

/** `Character.isSpaceChar` (Zs, Zl, Zp) */
function isSpaceChar(c: number): boolean {
  return /^[\p{Zs}\p{Zl}\p{Zp}]$/u.test(String.fromCharCode(c))
}

/** `Character.isISOControl` */
function isISOControl(c: number): boolean {
  return c <= 0x1f || (c >= 0x7f && c <= 0x9f)
}

class Parser {
  private requireServerAuthority = false
  readonly r: JavaUriParts = {
    scheme: null,
    schemeSpecificPart: null,
    authority: null,
    userInfo: null,
    host: null,
    port: -1,
    path: null,
    query: null,
    fragment: null,
  }
  private ipv6byteCount = 0

  constructor(private readonly input: string) {}

  private fail(reason: string, p?: number): never {
    throw new URISyntaxException(`${reason}${p === undefined ? '' : ` at index ${p}`}: ${this.input}`)
  }

  private failExpecting(expected: string, p: number): never {
    this.fail('Expected ' + expected, p)
  }

  private charAt(i: number): number {
    return this.input.charCodeAt(i)
  }

  private atChar(start: number, end: number, c: string): boolean {
    return start < end && this.input.charAt(start) === c
  }

  private atStr(start: number, end: number, s: string): boolean {
    let p = start
    const sn = s.length
    if (sn > end - p) return false
    let i = 0
    while (i < sn) {
      if (this.input.charAt(p++) !== s.charAt(i)) {
        break
      }
      i++
    }
    return i === sn
  }

  private scanChar(start: number, end: number, c: string): number {
    if (start < end && this.input.charAt(start) === c) return start + 1
    return start
  }

  private scanErrStop(start: number, end: number, err: string, stop: string): number {
    let p = start
    while (p < end) {
      const c = this.input.charAt(p)
      if (err.indexOf(c) >= 0) return -1
      if (stop.indexOf(c) >= 0) break
      p++
    }
    return p
  }

  private scanStop(start: number, end: number, stop: string): number {
    let p = start
    while (p < end) {
      const c = this.input.charAt(p)
      if (stop.indexOf(c) >= 0) break
      p++
    }
    return p
  }

  private scanEscape(start: number, n: number, first: number): number {
    const p = start
    const c = first
    if (c === 0x25) {
      if (p + 3 <= n && match(this.charAt(p + 1), L_HEX, H_HEX) && match(this.charAt(p + 2), L_HEX, H_HEX)) {
        return p + 3
      }
      this.fail('Malformed escape pair', p)
    } else if (c > 128 && !isSpaceChar(c) && !isISOControl(c)) {
      return p + 1
    }
    return p
  }

  private scanMask(start: number, n: number, lowMask: bigint, highMask: bigint): number {
    let p = start
    while (p < n) {
      const c = this.charAt(p)
      if (match(c, lowMask, highMask)) {
        p++
        continue
      }
      if ((lowMask & L_ESCAPED) !== 0n) {
        const q = this.scanEscape(p, n, c)
        if (q > p) {
          p = q
          continue
        }
      }
      break
    }
    return p
  }

  private checkChars(start: number, end: number, lowMask: bigint, highMask: bigint, what: string): void {
    const p = this.scanMask(start, end, lowMask, highMask)
    if (p < end) this.fail('Illegal character in ' + what, p)
  }

  private checkChar(p: number, lowMask: bigint, highMask: bigint, what: string): void {
    this.checkChars(p, p + 1, lowMask, highMask, what)
  }

  parse(rsa: boolean): void {
    this.requireServerAuthority = rsa
    const n = this.input.length
    let p = this.scanErrStop(0, n, '/?#', ':')
    if (p >= 0 && this.atChar(p, n, ':')) {
      if (p === 0) this.failExpecting('scheme name', 0)
      this.checkChar(0, L_ALPHA, H_ALPHA, 'scheme name')
      this.checkChars(1, p, L_SCHEME, H_SCHEME, 'scheme name')
      this.r.scheme = this.input.substring(0, p)
      p++ // Skip ':'
      if (this.atChar(p, n, '/')) {
        p = this.parseHierarchical(p, n)
      } else {
        const q = this.scanStop(p, n, '#')
        if (q <= p) this.failExpecting('scheme-specific part', p)
        this.checkChars(p, q, L_URIC, H_URIC, 'opaque part')
        this.r.schemeSpecificPart = this.input.substring(p, q)
        p = q
      }
    } else {
      p = this.parseHierarchical(0, n)
    }
    if (this.atChar(p, n, '#')) {
      this.checkChars(p + 1, n, L_URIC, H_URIC, 'fragment')
      this.r.fragment = this.input.substring(p + 1, n)
      p = n
    }
    if (p < n) this.fail('end of URI', p)
  }

  private parseHierarchical(start: number, n: number): number {
    let p = start
    if (this.atChar(p, n, '/') && this.atChar(p + 1, n, '/')) {
      p += 2
      const q = this.scanStop(p, n, '/?#')
      if (q > p) {
        p = this.parseAuthority(p, q)
      } else if (q < n) {
        // DEVIATION: Allow empty authority prior to non-empty
        // path, query component or fragment identifier
      } else this.failExpecting('authority', p)
    }
    let q = this.scanStop(p, n, '?#') // DEVIATION: May be empty
    this.checkChars(p, q, L_PATH, H_PATH, 'path')
    this.r.path = this.input.substring(p, q)
    p = q
    if (this.atChar(p, n, '?')) {
      p++
      q = this.scanStop(p, n, '#')
      this.checkChars(p, q, L_URIC, H_URIC, 'query')
      this.r.query = this.input.substring(p, q)
      p = q
    }
    return p
  }

  private parseAuthority(start: number, n: number): number {
    const p = start
    let q = p
    let qreg = p
    let ex: URISyntaxException | null = null
    let serverChars: boolean
    if (this.scanStop(p, n, ']') > p) {
      // contains a literal IPv6 address, therefore % is allowed
      serverChars = this.scanMask(p, n, L_SERVER_PERCENT, H_SERVER_PERCENT) === n
    } else {
      serverChars = this.scanMask(p, n, L_SERVER, H_SERVER) === n
    }
    const regChars = (qreg = this.scanMask(p, n, L_REG_NAME, H_REG_NAME)) === n
    if (regChars && !serverChars) {
      // Must be a registry-based authority
      this.r.authority = this.input.substring(p, n)
      return n
    }
    const skipParseException = !this.requireServerAuthority && regChars
    if (serverChars) {
      // Might be (probably is) a server-based authority, so attempt
      // to parse it as such.  If the attempt fails, try to treat it
      // as a registry-based authority.
      try {
        q = this.parseServer(p, n, skipParseException)
        if (q < n) {
          if (skipParseException) {
            this.r.userInfo = null
            this.r.host = null
            this.r.port = -1
            q = p
          } else {
            this.failExpecting('end of authority', q)
          }
        } else {
          this.r.authority = this.input.substring(p, n)
        }
      } catch (x) {
        if (!(x instanceof URISyntaxException)) throw x
        // Undo results of failed parse
        this.r.userInfo = null
        this.r.host = null
        this.r.port = -1
        if (this.requireServerAuthority) {
          // If we're insisting upon a server-based authority,
          // then just re-throw the exception
          throw x
        } else {
          // Save the exception in case it doesn't parse as a
          // registry either
          ex = x
          q = p
        }
      }
    }
    if (q < n) {
      if (regChars) {
        // Registry-based authority
        this.r.authority = this.input.substring(p, n)
      } else if (ex !== null) {
        // Re-throw exception; it was probably due to
        // a malformed IPv6 address
        throw ex
      } else {
        this.fail('Illegal character in authority', serverChars ? q : qreg)
      }
    }
    return n
  }

  private parseServer(start: number, n: number, skipParseException: boolean): number {
    let p = start
    let q: number
    // userinfo
    q = this.scanErrStop(p, n, '/?#', '@')
    if (q >= p && this.atChar(q, n, '@')) {
      this.checkChars(p, q, L_USERINFO, H_USERINFO, 'user info')
      this.r.userInfo = this.input.substring(p, q)
      p = q + 1 // Skip '@'
    }
    // hostname, IPv4 address, or IPv6 address
    if (this.atChar(p, n, '[')) {
      // DEVIATION from RFC2396: Support IPv6 addresses, per RFC2732
      p++
      q = this.scanErrStop(p, n, '/?#', ']')
      if (q > p && this.atChar(q, n, ']')) {
        // look for a "%" scope id
        const r = this.scanStop(p, q, '%')
        if (r > p) {
          this.parseIPv6Reference(p, r)
          if (r + 1 === q) {
            this.fail('scope id expected')
          }
          this.checkChars(r + 1, q, L_SCOPE_ID, H_SCOPE_ID, 'scope id')
        } else {
          this.parseIPv6Reference(p, q)
        }
        this.r.host = this.input.substring(p - 1, q + 1)
        p = q + 1
      } else {
        this.failExpecting('closing bracket for IPv6 address', q)
      }
    } else {
      q = this.parseIPv4Address(p, n)
      if (q <= p) q = this.parseHostname(p, n, skipParseException)
      p = q
    }
    // port
    if (this.atChar(p, n, ':')) {
      p++
      q = this.scanStop(p, n, '/')
      if (q > p) {
        this.checkChars(p, q, L_DIGIT, H_DIGIT, 'port number')
        const port = Number(this.input.substring(p, q))
        if (port > 2147483647) this.fail('Malformed port number', p)
        this.r.port = port
        p = q
      }
    } else if (p < n && skipParseException) {
      return p
    }
    if (p < n) this.failExpecting('port number', p)
    return p
  }

  private scanByte(start: number, n: number): number {
    const p = start
    const q = this.scanMask(p, n, L_DIGIT, H_DIGIT)
    if (q <= p) return q
    let i = p
    let j: number
    while ((j = this.scanChar(i, q, '0')) > i) i = j
    const significantDigitsNum = q - i
    if (significantDigitsNum < 3) return q // definitely < 255
    if (significantDigitsNum > 3) return p
    if (Number(this.input.substring(p, q)) > 255) return p
    return q
  }

  private scanIPv4Address(start: number, n: number, strict: boolean): number {
    let p = start
    let q = p
    const m = this.scanMask(p, n, L_DIGIT | L_DOT, H_DIGIT | H_DOT)
    if (m <= p || (strict && m !== n)) return -1
    for (;;) {
      // Per RFC2732: At most three digits per byte
      // Further constraint: Each element fits in a byte
      if ((q = this.scanByte(p, m)) <= p) break
      p = q
      if ((q = this.scanChar(p, m, '.')) <= p) break
      p = q
      if ((q = this.scanByte(p, m)) <= p) break
      p = q
      if ((q = this.scanChar(p, m, '.')) <= p) break
      p = q
      if ((q = this.scanByte(p, m)) <= p) break
      p = q
      if ((q = this.scanChar(p, m, '.')) <= p) break
      p = q
      if ((q = this.scanByte(p, m)) <= p) break
      p = q
      if (q < m) break
      return q
    }
    if (strict) this.fail('Malformed IPv4 address', q)
    return -1
  }

  private takeIPv4Address(start: number, n: number, expected: string): number {
    const p = this.scanIPv4Address(start, n, true)
    if (p <= start) this.failExpecting(expected, start)
    return p
  }

  private parseIPv4Address(start: number, n: number): number {
    let p: number
    try {
      p = this.scanIPv4Address(start, n, false)
    } catch (x) {
      if (x instanceof URISyntaxException) return -1
      throw x
    }
    if (p === -1) {
      return p
    }
    if (p > start && p < n) {
      // IPv4 address is followed by something - check that
      // it's a ":" as this is the only valid character to
      // follow an address.
      if (this.input.charAt(p) !== ':') {
        return -1
      }
    }
    if (p > start) this.r.host = this.input.substring(start, p)
    return p
  }

  private parseHostname(start: number, n: number, skipParseException: boolean): number {
    let p = start
    let q: number
    let l = -1 // Start of last parsed label
    do {
      // domainlabel = alphanum [ *( alphanum | "-" ) alphanum ]
      q = this.scanMask(p, n, L_ALPHANUM, H_ALPHANUM)
      if (q <= p) break
      l = p
      p = q
      q = this.scanMask(p, n, L_ALPHANUM | L_DASH, H_ALPHANUM | H_DASH)
      if (q > p) {
        if (this.input.charAt(q - 1) === '-') this.fail('Illegal character in hostname', q - 1)
        p = q
      }
      q = this.scanChar(p, n, '.')
      if (q <= p) break
      p = q
    } while (p < n)
    if (p < n && !this.atChar(p, n, ':')) {
      if (skipParseException) {
        return p
      }
      this.fail('Illegal character in hostname', p)
    }
    if (l < 0) this.failExpecting('hostname', start)
    // for a fully qualified hostname check that the rightmost
    // label starts with an alpha character.
    if (l > start && !match(this.charAt(l), L_ALPHA, H_ALPHA)) {
      this.fail('Illegal character in hostname', l)
    }
    this.r.host = this.input.substring(start, p)
    return p
  }

  private parseIPv6Reference(start: number, n: number): number {
    let p = start
    let compressedZeros = false
    const q = this.scanHexSeq(p, n)
    if (q > p) {
      p = q
      if (this.atStr(p, n, '::')) {
        compressedZeros = true
        p = this.scanHexPost(p + 2, n)
      } else if (this.atChar(p, n, ':')) {
        p = this.takeIPv4Address(p + 1, n, 'IPv4 address')
        this.ipv6byteCount += 4
      }
    } else if (this.atStr(p, n, '::')) {
      compressedZeros = true
      p = this.scanHexPost(p + 2, n)
    }
    if (p < n) this.fail('Malformed IPv6 address', start)
    if (this.ipv6byteCount > 16) this.fail('IPv6 address too long', start)
    if (!compressedZeros && this.ipv6byteCount < 16) this.fail('IPv6 address too short', start)
    if (compressedZeros && this.ipv6byteCount === 16) this.fail('Malformed IPv6 address', start)
    return p
  }

  private scanHexPost(start: number, n: number): number {
    let p = start
    if (p === n) return p
    const q = this.scanHexSeq(p, n)
    if (q > p) {
      p = q
      if (this.atChar(p, n, ':')) {
        p++
        p = this.takeIPv4Address(p, n, 'hex digits or IPv4 address')
        this.ipv6byteCount += 4
      }
    } else {
      p = this.takeIPv4Address(p, n, 'hex digits or IPv4 address')
      this.ipv6byteCount += 4
    }
    return p
  }

  private scanHexSeq(start: number, n: number): number {
    let p = start
    let q = this.scanMask(p, n, L_HEX, H_HEX)
    if (q <= p) return -1
    if (this.atChar(q, n, '.'))
      // Beginning of IPv4 address
      return -1
    if (q > p + 4) this.fail('IPv6 hexadecimal digit sequence too long', p)
    this.ipv6byteCount += 2
    p = q
    while (p < n) {
      if (!this.atChar(p, n, ':')) break
      if (this.atChar(p + 1, n, ':')) break // "::"
      p++
      q = this.scanMask(p, n, L_HEX, H_HEX)
      if (q <= p) this.failExpecting('digits for an IPv6 address', p)
      if (this.atChar(q, n, '.')) {
        // Beginning of IPv4 address
        p--
        break
      }
      if (q > p + 4) this.fail('IPv6 hexadecimal digit sequence too long', p)
      this.ipv6byteCount += 2
      p = q
    }
    return p
  }
}

/** `new java.net.URI(str)` : composants tels que calculés par Java ; lève URISyntaxException comme Java */
export function parseJavaUri(str: string): JavaUriParts {
  const parser = new Parser(str)
  parser.parse(false)
  return parser.r
}

/** `URI(str)` avec la validation de Java, et `uri.host` */
export function javaUri(str: string): { uri: URI; host: string | null } {
  const parts = parseJavaUri(str)
  return { uri: new URI(str), host: parts.host }
}
