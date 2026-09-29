// Support de portage : bcrypt de BCryptPasswordEncoder (spring-security.ts), sans bloquer le thread JS.
//
// Komga vérifie les mots de passe (BCrypt.checkpw) dans le thread de la requête ; KomgaJS n'a qu'un thread JS
// (PORTING.md, « Architecture d'exécution ») et une vérification y prenait ~70 ms en x86 (bien plus sur un Raspberry
// Pi), à chaque requête HTTP Basic sans cookie de session (clients OPDS, scripts) et à chaque connexion.
//
// Même résultat que bcryptjs (hashSync / compareSync), qui reste la référence (test/port/bcrypt.test.ts) :
// la préparation (`_hash` de bcryptjs : validation du sel, octets UTF-8 du mot de passe + octet nul, décodage du sel,
// format de l'empreinte) est reprise ici telle quelle, le calcul coûteux (`_crypt`, EksBlowfish) est fait par
// build/komgabcrypt.node (native/komga_bcrypt.c, `npm run build:native`) sur le pool de threads de libuv.
// Sans l'extension native, bcryptjs (même résultat, sur le thread JS) avec un avertissement.
import bcrypt from 'bcryptjs'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KotlinLogging } from './logging.js'

type Native = {
  crypt(password: Uint8Array, salt: Uint8Array, logRounds: number): Uint8Array
  cryptAsync(password: Uint8Array, salt: Uint8Array, logRounds: number): Promise<Uint8Array>
}

const logger = KotlinLogging.logger('org.springframework.security.crypto.bcrypt.BCrypt')
const here = dirname(fileURLToPath(import.meta.url))
let nativeModule: Native | null | undefined

function native(): Native | null {
  if (nativeModule === undefined) {
    nativeModule = null
    for (const p of [join(here, '../..', 'build/komgabcrypt.node'), join(here, '../../..', 'build/komgabcrypt.node'), join(process.cwd(), 'build/komgabcrypt.node')])
      if (existsSync(p)) {
        nativeModule = createRequire(import.meta.url)(p) as Native
        break
      }
    if (nativeModule === null) logger.warn(() => 'build/komgabcrypt.node not found (npm run build:native): password checks will block the event loop')
  }
  return nativeModule
}

const BCRYPT_SALT_LEN = 16
const C_ORIG_LENGTH = 6
const BASE64_CODE = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const BASE64_INDEX = (() => {
  const index = new Array<number>(128).fill(-1)
  for (let i = 0; i < BASE64_CODE.length; i++) index[BASE64_CODE.charCodeAt(i)] = i
  return index
})()

/** `utf8Array` de bcryptjs (une moitié de paire de substitution isolée est codée sur 3 octets) */
function utf8Array(s: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    let c1 = s.charCodeAt(i)
    let c2: number
    if (c1 < 128) out.push(c1)
    else if (c1 < 2048) out.push((c1 >> 6) | 192, (c1 & 63) | 128)
    else if ((c1 & 0xfc00) === 0xd800 && ((c2 = s.charCodeAt(i + 1)) & 0xfc00) === 0xdc00) {
      c1 = 0x10000 + ((c1 & 0x03ff) << 10) + (c2 & 0x03ff)
      ++i
      out.push((c1 >> 18) | 240, ((c1 >> 12) & 63) | 128, ((c1 >> 6) & 63) | 128, (c1 & 63) | 128)
    } else out.push((c1 >> 12) | 224, ((c1 >> 6) & 63) | 128, (c1 & 63) | 128)
  }
  return Uint8Array.from(out)
}

/** `base64_encode` de bcryptjs */
export function bcryptBase64Encode(b: ArrayLike<number>, len: number): string {
  if (len <= 0 || len > b.length) throw Error(`Illegal len: ${len}`)
  let off = 0
  let out = ''
  while (off < len) {
    let c1 = (b[off++] as number) & 0xff
    out += BASE64_CODE[(c1 >> 2) & 0x3f]
    c1 = (c1 & 0x03) << 4
    if (off >= len) {
      out += BASE64_CODE[c1 & 0x3f]
      break
    }
    let c2 = (b[off++] as number) & 0xff
    c1 |= (c2 >> 4) & 0x0f
    out += BASE64_CODE[c1 & 0x3f]
    c1 = (c2 & 0x0f) << 2
    if (off >= len) {
      out += BASE64_CODE[c1 & 0x3f]
      break
    }
    c2 = (b[off++] as number) & 0xff
    c1 |= (c2 >> 6) & 0x03
    out += BASE64_CODE[c1 & 0x3f]
    out += BASE64_CODE[c2 & 0x3f]
  }
  return out
}

/** `base64_decode` de bcryptjs */
function base64Decode(s: string, len: number): number[] {
  const index = (code: number) => (code < BASE64_INDEX.length ? (BASE64_INDEX[code] as number) : -1)
  const slen = s.length
  const rs: number[] = []
  let off = 0
  let olen = 0
  while (off < slen - 1 && olen < len) {
    const c1 = index(s.charCodeAt(off++))
    const c2 = index(s.charCodeAt(off++))
    if (c1 === -1 || c2 === -1) break
    rs.push(((c1 << 2) | ((c2 & 0x30) >> 4)) & 0xff)
    if (++olen >= len || off >= slen) break
    const c3 = index(s.charCodeAt(off++))
    if (c3 === -1) break
    rs.push((((c2 & 0x0f) << 4) | ((c3 & 0x3c) >> 2)) & 0xff)
    if (++olen >= len || off >= slen) break
    const c4 = index(s.charCodeAt(off++))
    // bcryptjs : String.fromCharCode(o) puis charCodeAt, un c4 invalide (-1) donne 0xffff
    rs.push((((c3 & 0x03) << 6) | c4) & 0xffff)
    ++olen
  }
  return rs
}

type Prepared = { password: Uint8Array; salt: Uint8Array; rounds: number; finish(bytes: Uint8Array): string } | { fallback: true }

/** `_hash` de bcryptjs jusqu'à l'appel de `_crypt` (mêmes erreurs, mêmes messages) */
function prepare(password: string, salt: string): Prepared {
  if (typeof password !== 'string' || typeof salt !== 'string') throw Error('Invalid string / salt: Not a string')
  let minor: string
  let offset: number
  if (salt.charAt(0) !== '$' || salt.charAt(1) !== '2') throw Error(`Invalid salt version: ${salt.substring(0, 2)}`)
  if (salt.charAt(2) === '$') {
    minor = String.fromCharCode(0)
    offset = 3
  } else {
    minor = salt.charAt(2)
    if ((minor !== 'a' && minor !== 'b' && minor !== 'y') || salt.charAt(3) !== '$') throw Error(`Invalid salt revision: ${salt.substring(2, 4)}`)
    offset = 4
  }
  if (salt.charAt(offset + 2) > '$') throw Error('Missing salt rounds')
  const rounds = Number.parseInt(salt.substring(offset, offset + 1), 10) * 10 + Number.parseInt(salt.substring(offset + 1, offset + 2), 10)
  const realSalt = salt.substring(offset + 3, offset + 25)
  const passwordb = utf8Array(password + (minor >= 'a' ? '\x00' : ''))
  const saltb = base64Decode(realSalt, BCRYPT_SALT_LEN)
  // cas que l'extension native n'accepte pas (octet > 0xff d'un sel invalide, erreurs de `_crypt`) : bcryptjs
  if (!(rounds >= 4 && rounds <= 31) || saltb.length !== BCRYPT_SALT_LEN || saltb.some((b) => b > 0xff)) return { fallback: true }
  return {
    password: passwordb,
    salt: Uint8Array.from(saltb),
    rounds,
    finish(bytes: Uint8Array): string {
      return `$2${minor >= 'a' ? minor : ''}$${rounds < 10 ? '0' : ''}${rounds}$${bcryptBase64Encode(saltb, saltb.length)}${bcryptBase64Encode(bytes, C_ORIG_LENGTH * 4 - 1)}`
    },
  }
}

/** `safeStringCompare` de bcryptjs */
function safeStringCompare(known: string, unknown: string): boolean {
  let diff = known.length ^ unknown.length
  for (let i = 0; i < known.length; ++i) diff |= known.charCodeAt(i) ^ unknown.charCodeAt(i)
  return diff === 0
}

/** `bcrypt.hashSync(password, salt)` (salt : "$2a$10$…") ; bloque le thread JS */
export function hashSync(password: string, salt: string): string {
  const n = native()
  const p = prepare(password, salt)
  if (n === null || 'fallback' in p) return bcrypt.hashSync(password, salt)
  return p.finish(n.crypt(p.password, p.salt, p.rounds))
}

/** `bcrypt.hashSync(password, salt)` calculé sur le pool de threads de libuv */
export async function hash(password: string, salt: string): Promise<string> {
  const n = native()
  const p = prepare(password, salt)
  if (n === null || 'fallback' in p) return bcrypt.hashSync(password, salt)
  return p.finish(await n.cryptAsync(p.password, p.salt, p.rounds))
}

/** `bcrypt.compareSync(password, hash)` calculé sur le pool de threads de libuv */
export async function compare(password: string, hashValue: string): Promise<boolean> {
  if (typeof password !== 'string' || typeof hashValue !== 'string') throw Error(`Illegal arguments: ${typeof password}, ${typeof hashValue}`)
  if (hashValue.length !== 60) return false
  return safeStringCompare(await hash(password, hashValue.substring(0, hashValue.length - 31)), hashValue)
}
