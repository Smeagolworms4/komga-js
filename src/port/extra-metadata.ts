// Support de portage : helpers génériques des modèles de métadonnées (sans jumeau Kotlin).
//  - `trim`, `isNullOrBlank` : String.trim() / isNullOrBlank() de Kotlin (Char.isWhitespace)
//  - `SortedMap` / `sortedMapOf` : java.util.SortedMap (TreeMap)
//  - `ULocale` : sous-ensemble de com.ibm.icu.util.ULocale (icu4j 78.3) utilisé par Komga :
//    `forLanguageTag`, `getLanguage`, `toLanguageTag`, `getISOLanguages`.
import { IllegalArgumentException, compareValues } from './kotlin.js'

// PORT: trim / isNullOrBlank déplacés dans port/kotlin.ts (réexportés ici)
export { trim, isNullOrBlank } from './kotlin.js'

// ---------------------------------------------------------------------------
// java.util.SortedMap (TreeMap)
// ---------------------------------------------------------------------------

/**
 * `SortedMap<K, V>` : une Map dont l'itération suit l'ordre naturel des clés (`compareValues`),
 * comme `java.util.TreeMap`. Les clés sont comparées par `===` (clés primitives).
 */
export class SortedMap<K, V> extends Map<K, V> {
  override set(key: K, value: V): this {
    if (this.has(key)) return super.set(key, value)
    let last: K | undefined
    for (const k of this.keys()) last = k
    super.set(key, value)
    if (this.size > 1 && compareValues(key, last) < 0) {
      const entries = [...this.entries()].sort(([a], [b]) => compareValues(a, b))
      super.clear()
      for (const [k, v] of entries) super.set(k, v)
    }
    return this
  }
}

/** `sortedMapOf(vararg pairs)` */
export function sortedMapOf<K, V>(...pairs: [K, V][]): SortedMap<K, V> {
  const m = new SortedMap<K, V>()
  for (const [k, v] of pairs) m.set(k, v)
  return m
}

/** `Map.toSortedMap()` */
export function toSortedMap<K, V>(map: Iterable<[K, V]>): SortedMap<K, V> {
  return sortedMapOf(...map)
}

// ---------------------------------------------------------------------------
// com.ibm.icu.util.ULocale (icu4j 78.3)
// ---------------------------------------------------------------------------
//
// Portage à plat (sous-ensemble) des classes icu4j suivantes, sur le chemin
// ULocale.forLanguageTag(tag) -> getLanguage() / toLanguageTag() :
//   com.ibm.icu.impl.locale.{AsciiUtil, StringTokenIterator, ParseStatus, LanguageTag,
//   InternalLocaleBuilder, BaseLocale, LocaleExtensions, UnicodeLocaleExtension},
//   com.ibm.icu.impl.{LocaleIDParser, LocaleIDs}, com.ibm.icu.util.ULocale.
// Intl.Locale n'est PAS équivalent : il lève une RangeError sur les tags mal formés
// (icu4j garde le préfixe bien formé) et applique toutes les substitutions CLDR
// (mo -> ro, sh -> sr-Latn, ger -> de...), ce que ULocale.forLanguageTag ne fait pas.
//
// Données :
//  - LocaleIDs._languages / _languages3 / _obsoleteLanguages(3) recopiées de icu4j 78.3.
//  - LocaleIDs.threeToTwoLetterRegion n'est pas porté : sur ce chemin la région vient d'un tag BCP 47
//    (2 lettres ou 3 chiffres) et ne peut jamais être un code alpha-3.
//  - KeyTypeData (clé/type de l'extension -u-) : l'aller-retour BCP 47 -> legacy -> BCP 47 fait par
//    getInstance()/extensions() est l'identité (après passage en minuscules) sauf pour les alias de
//    KEYTYPE_ALIASES, extraits de KeyTypeData.KEYMAP (icu4j 78.3) par réflexion.
//
// Équivalence vérifiée (jshell + icu4j-78.3.jar) : forLanguageTag(x).toLanguageTag(),
// forLanguageTag(x).getLanguage() et BCP47TagValidator.isValid/normalize identiques sur les
// entrées des tests Kotlin, ~120 tags choisis (valides, invalides, casse, grandfathered, extlang,
// extensions -u-/-t-/-x-, lvariant, POSIX, und, root, vide, espaces), 3 650 tags ciblés sur les
// extensions -u- (toutes les clés et tous les types de KeyTypeData, avec/sans type, casse) et
// 18 000 tags aléatoires (y compris l'IllegalArgumentException "variants is too long") : 0 écart.

const SEP = '-'
const PRIVATEUSE = 'x'
const UNDETERMINED = 'und'
const PRIVUSE_VARIANT_PREFIX = 'lvariant'
const BASELOCALE_SEP = '_'

// --- AsciiUtil ---

function isAlpha(c: string): boolean {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')
}
function isNumeric(c: string): boolean {
  return c >= '0' && c <= '9'
}
function isAlphaNumeric(c: string): boolean {
  return isAlpha(c) || isNumeric(c)
}
function isAlphaString(s: string): boolean {
  for (const c of s) if (!isAlpha(c)) return false
  return true
}
function isNumericString(s: string): boolean {
  for (const c of s) if (!isNumeric(c)) return false
  return true
}
function isAlphaNumericString(s: string): boolean {
  for (const c of s) if (!isAlphaNumeric(c)) return false
  return true
}
function toLowerChar(c: string): string {
  return c >= 'A' && c <= 'Z' ? String.fromCharCode(c.charCodeAt(0) + 0x20) : c
}
function toUpperChar(c: string): string {
  return c >= 'a' && c <= 'z' ? String.fromCharCode(c.charCodeAt(0) - 0x20) : c
}
function toLowerString(s: string): string {
  return s.replace(/[A-Z]/g, toLowerChar)
}
function toUpperString(s: string): string {
  return s.replace(/[a-z]/g, toUpperChar)
}
function toTitleString(s: string): string {
  if (s.length === 0) return s
  let idx = 0
  const c = s.charAt(idx)
  if (!(c >= 'a' && c <= 'z')) {
    for (idx = 1; idx < s.length; idx++) {
      if (c >= 'A' && c <= 'Z') break
    }
  }
  if (idx === s.length) return s
  let buf = s.substring(0, idx)
  if (idx === 0) {
    buf += toUpperChar(s.charAt(idx))
    idx++
  }
  for (; idx < s.length; idx++) buf += toLowerChar(s.charAt(idx))
  return buf
}
function caseIgnoreMatch(s1: string, s2: string): boolean {
  return s1 === s2 || (s1.length === s2.length && toLowerString(s1) === toLowerString(s2))
}

// --- StringTokenIterator ---

class StringTokenIterator {
  private _token: string | null = null
  private _start = 0
  private _end = 0
  private _done = false

  constructor(
    private readonly _text: string,
    private readonly _dlms: string,
  ) {
    this.setStart(0)
  }

  current(): string {
    return this._token as string
  }
  currentStart(): number {
    return this._start
  }
  currentEnd(): number {
    return this._end
  }
  isDone(): boolean {
    return this._done
  }
  next(): string | null {
    if (this.hasNext()) {
      this._start = this._end + 1
      this._end = this.nextDelimiter(this._start)
      this._token = this._text.substring(this._start, this._end)
    } else {
      this._start = this._end
      this._token = null
      this._done = true
    }
    return this._token
  }
  hasNext(): boolean {
    return this._end < this._text.length
  }
  private setStart(offset: number): void {
    this._start = offset
    this._end = this.nextDelimiter(this._start)
    this._token = this._text.substring(this._start, this._end)
    this._done = false
  }
  private nextDelimiter(start: number): number {
    let idx = start
    while (idx < this._text.length) {
      if (this._dlms.includes(this._text.charAt(idx))) break
      idx++
    }
    return idx
  }
}

// --- ParseStatus ---

class ParseStatus {
  _parseLength = 0
  _errorIndex = -1
  _errorMsg: string | null = null

  isError(): boolean {
    return this._errorIndex >= 0
  }
}

// --- LanguageTag ---

const LEGACY = new Map<string, [string, string]>(
  (
    [
      ['art-lojban', 'jbo'],
      ['cel-gaulish', 'xtg'],
      ['en-GB-oed', 'en-GB-x-oed'],
      ['i-ami', 'ami'],
      ['i-bnn', 'bnn'],
      ['i-default', 'en-x-i-default'],
      ['i-enochian', 'und-x-i-enochian'],
      ['i-hak', 'hak'],
      ['i-klingon', 'tlh'],
      ['i-lux', 'lb'],
      ['i-mingo', 'see-x-i-mingo'],
      ['i-navajo', 'nv'],
      ['i-pwn', 'pwn'],
      ['i-tao', 'tao'],
      ['i-tay', 'tay'],
      ['i-tsu', 'tsu'],
      ['no-bok', 'nb'],
      ['no-nyn', 'nn'],
      ['sgn-BE-FR', 'sfb'],
      ['sgn-BE-NL', 'vgt'],
      ['sgn-CH-DE', 'sgg'],
      ['zh-guoyu', 'cmn'],
      ['zh-hakka', 'hak'],
      ['zh-min', 'nan-x-zh-min'],
      ['zh-min-nan', 'nan'],
      ['zh-xiang', 'hsn'],
    ] as [string, string][]
  ).map((e) => [toLowerString(e[0]), e]),
)

class LanguageTag {
  _language = ''
  _script = ''
  _region = ''
  _privateuse = ''
  _extlangs: string[] = []
  _variants: string[] = []
  _extensions: string[] = []

  static parse(languageTag: string, sts: ParseStatus): LanguageTag {
    let itr: StringTokenIterator
    let isLegacy = false

    let gfmap = LEGACY.get(toLowerString(languageTag))
    let dash = 2
    while (gfmap === undefined && (dash = languageTag.indexOf('-', dash + 1)) !== -1) {
      gfmap = LEGACY.get(toLowerString(languageTag.substring(0, dash)))
    }

    if (gfmap !== undefined) {
      if (gfmap[0].length === languageTag.length) {
        itr = new StringTokenIterator(gfmap[1], SEP)
      } else {
        itr = new StringTokenIterator(gfmap[1] + languageTag.substring(dash), SEP)
      }
      isLegacy = true
    } else {
      itr = new StringTokenIterator(languageTag, SEP)
    }

    const tag = new LanguageTag()

    if (tag.parseLanguage(itr, sts)) {
      if (tag._language.length <= 3) tag.parseExtlangs(itr, sts)
      tag.parseScript(itr, sts)
      tag.parseRegion(itr, sts)
      tag.parseVariants(itr, sts)
      tag.parseExtensions(itr, sts)
    }
    tag.parsePrivateuse(itr, sts)

    if (isLegacy) {
      sts._parseLength = languageTag.length
    } else if (!itr.isDone() && !sts.isError()) {
      const s = itr.current()
      sts._errorIndex = itr.currentStart()
      sts._errorMsg = s.length === 0 ? 'Empty subtag' : 'Invalid subtag: ' + s
    }

    return tag
  }

  private parseLanguage(itr: StringTokenIterator, sts: ParseStatus): boolean {
    if (itr.isDone() || sts.isError()) return false
    let found = false
    const s = itr.current()
    if (LanguageTag.isLanguage(s)) {
      found = true
      this._language = s
      sts._parseLength = itr.currentEnd()
      itr.next()
    }
    return found
  }

  private parseExtlangs(itr: StringTokenIterator, sts: ParseStatus): boolean {
    if (itr.isDone() || sts.isError()) return false
    let found = false
    while (!itr.isDone()) {
      const s = itr.current()
      if (!LanguageTag.isExtlang(s)) break
      found = true
      this._extlangs.push(s)
      sts._parseLength = itr.currentEnd()
      itr.next()
      if (this._extlangs.length === 3) break
    }
    return found
  }

  private parseScript(itr: StringTokenIterator, sts: ParseStatus): boolean {
    if (itr.isDone() || sts.isError()) return false
    let found = false
    const s = itr.current()
    if (LanguageTag.isScript(s)) {
      found = true
      this._script = s
      sts._parseLength = itr.currentEnd()
      itr.next()
    }
    return found
  }

  private parseRegion(itr: StringTokenIterator, sts: ParseStatus): boolean {
    if (itr.isDone() || sts.isError()) return false
    let found = false
    const s = itr.current()
    if (LanguageTag.isRegion(s)) {
      found = true
      this._region = s
      sts._parseLength = itr.currentEnd()
      itr.next()
    }
    return found
  }

  private parseVariants(itr: StringTokenIterator, sts: ParseStatus): boolean {
    if (itr.isDone() || sts.isError()) return false
    let found = false
    while (!itr.isDone()) {
      let s = itr.current()
      if (!LanguageTag.isVariant(s)) break
      found = true
      s = s.toUpperCase()
      if (!this._variants.includes(s)) this._variants.push(s)
      sts._parseLength = itr.currentEnd()
      itr.next()
    }
    return found
  }

  private parseExtensions(itr: StringTokenIterator, sts: ParseStatus): boolean {
    if (itr.isDone() || sts.isError()) return false
    let found = false
    while (!itr.isDone()) {
      let s = itr.current()
      if (LanguageTag.isExtensionSingleton(s)) {
        const start = itr.currentStart()
        const singleton = s.toLowerCase()
        let sb = singleton
        itr.next()
        while (!itr.isDone()) {
          s = itr.current()
          if (LanguageTag.isExtensionSubtag(s)) {
            sb += SEP + s
            sts._parseLength = itr.currentEnd()
          } else {
            break
          }
          itr.next()
        }
        if (sts._parseLength <= start) {
          sts._errorIndex = start
          sts._errorMsg = "Incomplete extension '" + singleton + "'"
          break
        }
        let alreadyHas = false
        for (const extension of this._extensions) alreadyHas ||= extension.charAt(0) === sb.charAt(0)
        if (!alreadyHas) this._extensions.push(sb)
        found = true
      } else {
        break
      }
    }
    return found
  }

  private parsePrivateuse(itr: StringTokenIterator, sts: ParseStatus): boolean {
    if (itr.isDone() || sts.isError()) return false
    let found = false
    let s = itr.current()
    if (LanguageTag.isPrivateusePrefix(s)) {
      const start = itr.currentStart()
      let sb = s
      itr.next()
      while (!itr.isDone()) {
        s = itr.current()
        if (!LanguageTag.isPrivateuseSubtag(s)) break
        sb += SEP + s
        sts._parseLength = itr.currentEnd()
        itr.next()
      }
      if (sts._parseLength <= start) {
        sts._errorIndex = start
        sts._errorMsg = 'Incomplete privateuse'
      } else {
        this._privateuse = sb
        found = true
      }
    }
    return found
  }

  static parseLocale(baseLocale: BaseLocale, localeExtensions: LocaleExtensions): LanguageTag {
    const tag = new LanguageTag()

    let language = baseLocale.language
    const script = baseLocale.script
    const region = baseLocale.region
    const variant = baseLocale.variant

    let hasSubtag = false

    let privuseVar: string | null = null

    if (language.length > 0 && LanguageTag.isLanguage(language)) {
      if (language === 'iw') language = 'he'
      else if (language === 'ji') language = 'yi'
      else if (language === 'in') language = 'id'
      tag._language = language
    }

    if (script.length > 0 && LanguageTag.isScript(script)) {
      tag._script = toTitleString(script)
      hasSubtag = true
    }

    if (region.length > 0 && LanguageTag.isRegion(region)) {
      tag._region = toUpperString(region)
      hasSubtag = true
    }

    if (variant.length > 0) {
      let variants: string[] | null = null
      const varitr = new StringTokenIterator(variant, BASELOCALE_SEP)
      while (!varitr.isDone()) {
        const v = varitr.current()
        if (!LanguageTag.isVariant(v)) break
        if (variants === null) variants = []
        variants.push(toLowerString(v))
        varitr.next()
      }
      if (variants !== null) {
        tag._variants = variants
        hasSubtag = true
      }
      if (!varitr.isDone()) {
        let buf = ''
        while (!varitr.isDone()) {
          let prvv = varitr.current()
          if (!LanguageTag.isPrivateuseSubtag(prvv)) break
          if (buf.length > 0) buf += SEP
          prvv = toLowerString(prvv)
          buf += prvv
          varitr.next()
        }
        if (buf.length > 0) privuseVar = buf
      }
    }

    let extensions: string[] | null = null
    let privateuse: string | null = null

    for (const locextKey of localeExtensions.getKeys()) {
      const ext = localeExtensions.getExtension(locextKey) as Extension
      if (LanguageTag.isPrivateusePrefixChar(locextKey)) {
        privateuse = ext.getValue()
      } else {
        if (extensions === null) extensions = []
        extensions.push(locextKey + SEP + ext.getValue())
      }
    }

    if (extensions !== null) {
      tag._extensions = extensions
      hasSubtag = true
    }

    if (privuseVar !== null) {
      if (privateuse === null) {
        privateuse = PRIVUSE_VARIANT_PREFIX + SEP + privuseVar
      } else {
        privateuse = privateuse + SEP + PRIVUSE_VARIANT_PREFIX + SEP + privuseVar.replaceAll(BASELOCALE_SEP, SEP)
      }
    }

    if (privateuse !== null) tag._privateuse = privateuse

    if (tag._language.length === 0 && (hasSubtag || privateuse === null)) tag._language = UNDETERMINED

    return tag
  }

  static isLanguage(s: string): boolean {
    return s.length >= 2 && s.length <= 8 && isAlphaString(s)
  }
  static isExtlang(s: string): boolean {
    return s.length === 3 && isAlphaString(s)
  }
  static isScript(s: string): boolean {
    return s.length === 4 && isAlphaString(s)
  }
  static isRegion(s: string): boolean {
    return (s.length === 2 && isAlphaString(s)) || (s.length === 3 && isNumericString(s))
  }
  static isVariant(s: string): boolean {
    const len = s.length
    if (len >= 5 && len <= 8) return isAlphaNumericString(s)
    if (len === 4)
      return isNumeric(s.charAt(0)) && isAlphaNumeric(s.charAt(1)) && isAlphaNumeric(s.charAt(2)) && isAlphaNumeric(s.charAt(3))
    return false
  }
  static isExtensionSingleton(s: string): boolean {
    return s.length === 1 && isAlphaNumericString(s) && !caseIgnoreMatch(PRIVATEUSE, s)
  }
  static isExtensionSingletonChar(c: string): boolean {
    return LanguageTag.isExtensionSingleton(c)
  }
  static isExtensionSubtag(s: string): boolean {
    return s.length >= 2 && s.length <= 8 && isAlphaNumericString(s)
  }
  static isPrivateusePrefix(s: string): boolean {
    return s.length === 1 && caseIgnoreMatch(PRIVATEUSE, s)
  }
  static isPrivateusePrefixChar(c: string): boolean {
    return caseIgnoreMatch(PRIVATEUSE, c)
  }
  static isPrivateuseSubtag(s: string): boolean {
    return s.length >= 1 && s.length <= 8 && isAlphaNumericString(s)
  }

  static canonicalizeExtension(s: string): string {
    s = toLowerString(s)
    if (s.startsWith('u-')) {
      let found: number
      while (s.endsWith('-true')) s = s.substring(0, s.length - 5)
      while ((found = s.indexOf('-true-')) > 0) s = s.substring(0, found) + s.substring(found + 5)
      while (s.endsWith('-yes')) s = s.substring(0, s.length - 4)
      while ((found = s.indexOf('-yes-')) > 0) s = s.substring(0, found) + s.substring(found + 4)
    }
    return s
  }
}

// --- UnicodeLocaleExtension / Extension / LocaleExtensions ---

class Extension {
  constructor(
    readonly key: string,
    protected _value: string,
  ) {}
  getValue(): string {
    return this._value
  }
}

function isUnicodeSingletonChar(c: string): boolean {
  return toLowerChar(c) === 'u'
}
function isUnicodeAttribute(s: string): boolean {
  return s.length >= 3 && s.length <= 8 && isAlphaNumericString(s)
}
function isUnicodeKey(s: string): boolean {
  return s.length === 2 && isAlphaNumeric(s.charAt(0)) && isAlpha(s.charAt(1))
}
function isUnicodeTypeSubtag(s: string): boolean {
  return s.length >= 3 && s.length <= 8 && isAlphaNumericString(s)
}

class UnicodeLocaleExtension extends Extension {
  constructor(
    readonly attributes: string[],
    readonly keywords: Map<string, string>,
  ) {
    super('u', '')
    let sb = ''
    for (const attribute of attributes) sb += SEP + attribute
    for (const [key, value] of keywords) {
      sb += SEP + key
      if (value.length > 0) sb += SEP + value
    }
    this._value = sb.substring(1)
  }
}

const javaCompare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

class LocaleExtensions {
  // SortedMap<Character, Extension>
  private readonly _map = new Map<string, Extension>()

  constructor(
    extensions: Map<string, string> | null,
    uattributes: Map<string, string> | null,
    ukeywords: Map<string, [string, string]> | null,
  ) {
    const map = new Map<string, Extension>()
    if (extensions !== null && extensions.size > 0) {
      for (const [k, v] of extensions) {
        const key = toLowerChar(k)
        let value: string | null = v
        if (LanguageTag.isPrivateusePrefixChar(key)) {
          value = removePrivateuseVariant(value)
          if (value === null) continue
        }
        map.set(key, new Extension(key, toLowerString(value)))
      }
    }
    const hasUAttributes = uattributes !== null && uattributes.size > 0
    const hasUKeywords = ukeywords !== null && ukeywords.size > 0
    if (hasUAttributes || hasUKeywords) {
      const uaset = hasUAttributes ? [...new Set([...uattributes.values()].map(toLowerString))].sort(javaCompare) : []
      const ukmap = new Map<string, string>()
      if (hasUKeywords) {
        for (const [key, type] of [...ukeywords.values()].map(([k, t]) => [toLowerString(k), toLowerString(t)]).sort(([a], [b]) => javaCompare(a as string, b as string)))
          ukmap.set(key as string, type as string)
      }
      map.set('u', new UnicodeLocaleExtension(uaset, ukmap))
    }
    for (const k of [...map.keys()].sort(javaCompare)) this._map.set(k, map.get(k) as Extension)
  }

  getKeys(): string[] {
    return [...this._map.keys()]
  }
  getExtension(key: string): Extension | undefined {
    return this._map.get(toLowerChar(key))
  }
  getUnicodeLocaleType(unicodeLocaleKey: string): string | null {
    const ext = this._map.get('u')
    if (ext === undefined) return null
    return (ext as UnicodeLocaleExtension).keywords.get(toLowerString(unicodeLocaleKey)) ?? null
  }
}

const EMPTY_EXTENSIONS = new LocaleExtensions(null, null, null)

// --- BaseLocale ---

class BaseLocale {
  readonly language: string
  readonly script: string
  readonly region: string
  readonly variant: string

  constructor(language: string, script: string, region: string, variant: string) {
    this.language = toLowerString(language)
    this.script = toTitleString(script)
    this.region = toUpperString(region)
    this.variant = toUpperString(variant)
  }
}

const BASELOCALE_ROOT = new BaseLocale('', '', '', '')

// --- InternalLocaleBuilder ---

class LocaleSyntaxException extends Error {}

function removePrivateuseVariant(privuseVal: string): string | null {
  const itr = new StringTokenIterator(privuseVal, SEP)
  let prefixStart = -1
  let sawPrivuseVar = false
  while (!itr.isDone()) {
    if (prefixStart !== -1) {
      sawPrivuseVar = true
      break
    }
    if (caseIgnoreMatch(itr.current(), PRIVUSE_VARIANT_PREFIX)) prefixStart = itr.currentStart()
    itr.next()
  }
  if (!sawPrivuseVar) return privuseVal
  return prefixStart === 0 ? null : privuseVal.substring(0, prefixStart - 1)
}

class InternalLocaleBuilder {
  private _language = ''
  private _script = ''
  private _region = ''
  private _variant = ''
  // HashMap<CaseInsensitiveChar, String> : clé en minuscules
  private _extensions: Map<string, string> | null = null
  // HashSet<CaseInsensitiveString> : clé en minuscules -> première valeur ajoutée
  private _uattributes: Map<string, string> | null = null
  // HashMap<CaseInsensitiveString, String> : clé en minuscules -> [clé d'origine, type]
  private _ukeywords: Map<string, [string, string]> | null = null

  addUnicodeLocaleAttribute(attribute: string): this {
    if (!isUnicodeAttribute(attribute)) throw new LocaleSyntaxException('Ill-formed Unicode locale attribute: ' + attribute)
    if (this._uattributes === null) this._uattributes = new Map()
    if (!this._uattributes.has(toLowerString(attribute))) this._uattributes.set(toLowerString(attribute), attribute)
    return this
  }

  setUnicodeLocaleKeyword(key: string, type: string): this {
    if (!isUnicodeKey(key)) throw new LocaleSyntaxException('Ill-formed Unicode locale keyword key: ' + key)
    if (type.length !== 0) {
      const tp = type.replaceAll(BASELOCALE_SEP, SEP)
      const itr = new StringTokenIterator(tp, SEP)
      while (!itr.isDone()) {
        const s = itr.current()
        if (!isUnicodeTypeSubtag(s)) throw new LocaleSyntaxException('Ill-formed Unicode locale keyword type: ' + type)
        itr.next()
      }
    }
    if (this._ukeywords === null) this._ukeywords = new Map()
    this.putUKeyword(key, type)
    return this
  }

  private putUKeyword(key: string, type: string): void {
    const ukeywords = this._ukeywords as Map<string, [string, string]>
    const existing = ukeywords.get(toLowerString(key))
    ukeywords.set(toLowerString(key), [existing !== undefined ? existing[0] : key, type])
  }

  setExtension(singleton: string, value: string): this {
    const isBcpPrivateuse = LanguageTag.isPrivateusePrefixChar(singleton)
    if (!isBcpPrivateuse && !LanguageTag.isExtensionSingletonChar(singleton))
      throw new LocaleSyntaxException('Ill-formed extension key: ' + singleton)

    const remove = value.length === 0
    const key = toLowerChar(singleton)

    if (remove) {
      if (isUnicodeSingletonChar(key)) {
        this._uattributes?.clear()
        this._ukeywords?.clear()
      } else {
        this._extensions?.delete(key)
      }
    } else {
      const val = value.replaceAll(BASELOCALE_SEP, SEP)
      const itr = new StringTokenIterator(val, SEP)
      while (!itr.isDone()) {
        const s = itr.current()
        const validSubtag = isBcpPrivateuse ? LanguageTag.isPrivateuseSubtag(s) : LanguageTag.isExtensionSubtag(s)
        if (!validSubtag) throw new LocaleSyntaxException('Ill-formed extension value: ' + s)
        itr.next()
      }
      if (isUnicodeSingletonChar(key)) {
        this.setUnicodeLocaleExtension(val)
      } else {
        if (this._extensions === null) this._extensions = new Map()
        this._extensions.set(key, val)
      }
    }
    return this
  }

  private setExtensions(bcpExtensions: string[], privateuse: string): this {
    this.clearExtensions()
    if (bcpExtensions.length > 0) {
      // PORT: processedExtensions n'est jamais alimenté dans icu4j (les doublons sont déjà écartés par LanguageTag.parse)
      for (const bcpExt of bcpExtensions) {
        const key = toLowerChar(bcpExt.charAt(0))
        if (isUnicodeSingletonChar(key)) {
          this.setUnicodeLocaleExtension(bcpExt.substring(2))
        } else {
          if (this._extensions === null) this._extensions = new Map()
          this._extensions.set(key, bcpExt.substring(2))
        }
      }
    }
    if (privateuse.length > 0) {
      if (this._extensions === null) this._extensions = new Map()
      this._extensions.set(toLowerChar(privateuse.charAt(0)), privateuse.substring(2))
    }
    return this
  }

  setLanguageTag(langtag: LanguageTag): this {
    this.clear()
    if (langtag._extlangs.length > 0) {
      this._language = langtag._extlangs[0] as string
    } else {
      const language = langtag._language
      if (language !== UNDETERMINED) this._language = language
    }
    this._script = langtag._script
    this._region = langtag._region

    const bcpVariants = [...langtag._variants].sort(javaCompare)
    if (bcpVariants.length > 0) this._variant = bcpVariants.join(BASELOCALE_SEP)

    this.setExtensions(langtag._extensions, langtag._privateuse)

    return this
  }

  setLocale(base: BaseLocale, extensions: LocaleExtensions): this {
    // PORT: validations de setLocale omises : seul setLocale(BaseLocale.ROOT, exts) est utilisé (toLanguageTag)
    this._language = base.language
    this._script = base.script
    this._region = base.region
    this._variant = base.variant
    this.clearExtensions()

    for (const key of extensions.getKeys()) {
      const e = extensions.getExtension(key) as Extension
      if (e instanceof UnicodeLocaleExtension) {
        for (const uatr of e.attributes) {
          if (this._uattributes === null) this._uattributes = new Map()
          if (!this._uattributes.has(toLowerString(uatr))) this._uattributes.set(toLowerString(uatr), uatr)
        }
        for (const [ukey, utype] of e.keywords) {
          if (this._ukeywords === null) this._ukeywords = new Map()
          this.putUKeyword(ukey, utype)
        }
      } else {
        if (this._extensions === null) this._extensions = new Map()
        this._extensions.set(toLowerChar(key), e.getValue())
      }
    }
    return this
  }

  private clear(): this {
    this._language = ''
    this._script = ''
    this._region = ''
    this._variant = ''
    this.clearExtensions()
    return this
  }

  private clearExtensions(): this {
    this._extensions?.clear()
    this._uattributes?.clear()
    this._ukeywords?.clear()
    return this
  }

  getBaseLocale(): BaseLocale {
    const language = this._language
    const script = this._script
    const region = this._region
    let variant = this._variant

    if (this._extensions !== null) {
      const privuse = this._extensions.get(PRIVATEUSE)
      if (privuse !== undefined) {
        const itr = new StringTokenIterator(privuse, SEP)
        let sawPrefix = false
        let privVarStart = -1
        while (!itr.isDone()) {
          if (sawPrefix) {
            privVarStart = itr.currentStart()
            break
          }
          if (caseIgnoreMatch(itr.current(), PRIVUSE_VARIANT_PREFIX)) sawPrefix = true
          itr.next()
        }
        if (privVarStart !== -1) {
          let sb = variant
          if (sb.length !== 0) sb += BASELOCALE_SEP
          sb += privuse.substring(privVarStart).replaceAll(SEP, BASELOCALE_SEP)
          variant = sb
        }
      }
    }

    return new BaseLocale(language, script, region, variant)
  }

  getLocaleExtensions(): LocaleExtensions {
    if (
      (this._extensions === null || this._extensions.size === 0) &&
      (this._uattributes === null || this._uattributes.size === 0) &&
      (this._ukeywords === null || this._ukeywords.size === 0)
    )
      return EMPTY_EXTENSIONS
    return new LocaleExtensions(this._extensions, this._uattributes, this._ukeywords)
  }

  private setUnicodeLocaleExtension(subtags: string): void {
    this._uattributes?.clear()
    this._ukeywords?.clear()

    const itr = new StringTokenIterator(subtags, SEP)

    while (!itr.isDone()) {
      if (!isUnicodeAttribute(itr.current())) break
      if (this._uattributes === null) this._uattributes = new Map()
      if (!this._uattributes.has(toLowerString(itr.current()))) this._uattributes.set(toLowerString(itr.current()), itr.current())
      itr.next()
    }

    let key: string | null = null
    let type: string
    let typeStart = -1
    let typeEnd = -1
    while (!itr.isDone()) {
      if (key !== null) {
        if (isUnicodeKey(itr.current())) {
          type = typeStart === -1 ? '' : subtags.substring(typeStart, typeEnd)
          if (this._ukeywords === null) this._ukeywords = new Map()
          this.putUKeyword(key, type)

          const tmpKey = itr.current()
          key = this._ukeywords.has(toLowerString(tmpKey)) ? null : tmpKey
          typeStart = typeEnd = -1
        } else {
          if (typeStart === -1) typeStart = itr.currentStart()
          typeEnd = itr.currentEnd()
        }
      } else if (isUnicodeKey(itr.current())) {
        key = itr.current()
        if (this._ukeywords !== null && this._ukeywords.has(toLowerString(key))) key = null
      }

      if (!itr.hasNext()) {
        if (key !== null) {
          type = typeStart === -1 ? '' : subtags.substring(typeStart, typeEnd)
          if (this._ukeywords === null) this._ukeywords = new Map()
          this.putUKeyword(key, type)
        }
        break
      }

      itr.next()
    }
  }
}

// --- LocaleIDs ---

const _languages = (
  'aa ab ace ach ada ady ae aeb af afh agq ain ak akk akz ale aln alt am an ang anp ar arc arn aro arp ' +
  'arq ars arw ary arz as asa ase ast av avk awa ay az ba bal ban bar bas bax bbc bbj be bej bem bew ' +
  'bez bfd bfq bg bgc bgn bho bi bik bin bjn bkm bla bm bn bo bpy bqi br bra brh brx bs bss bua bug bum ' +
  'byn byv ca cad car cay cch ccp ce ceb cgg ch chb chg chk chm chn cho chp chr chy ckb co cop cps cr ' +
  'crh cs csb cu cv cy da dak dar dav day de del den dgr din dje doi dra dsb dua dum dv dyo dyu dz dzg ' +
  'ebu ee efi egy eka el elx en enm eo es et eu ewo fa fan fat ff fi fil fiu fj fo fon fr frm fro frr ' +
  'frs fur fy ga gaa gay gba gd gem gez gil gl gmh gn goh gon gor got grb grc gsw gu guz gv gwi ha hai ' +
  'haw he hi hil him hit hmn ho hr hsb ht hu hup hy hz ia iba ibb id ie ig ii ijo ik ilo inc ine inh io ' +
  'ira iro is it iu ja jbo jgo jmc jpr jrb jv ka kaa kab kac kaj kam kar kaw kbd kbl kcg kde kea kfo kg ' +
  'kha khi kho khq ki kj kk kkj kl kln km kmb kn ko kok kos kpe kr krc krl kro kru ks ksb ksf ksh ku ' +
  'kum kut kv kw ky la lad lag lah lam lb lez lg li lkt ln lo lol loz lt lu lua lui lun luo lus luy lv ' +
  'mad maf mag mai mak man map mas mde mdf mdr men mer mfe mg mga mgh mgo mh mi mic min mis mk mkh ml ' +
  'mn mnc mni mno moh mos mr ms mt mua mul mun mus mwl mwr my mye myn myv na nah nai nap naq nb nd nds ' +
  'ne new ng nia nic niu nl nmg nn nnh no nog non nqo nr nso nub nus nv nwc ny nym nyn nyo nzi oc oj om ' +
  'or os osa ota oto pa paa pag pal pam pap pau peo phi phn pi pl pon pra pro ps pt qu raj rap rar rm ' +
  'rn ro roa rof rom ru rup rw rwk sa sad sah sai sal sam saq sas sat sba sbp sc scn sco sd se see seh ' +
  'sel sem ses sg sga sgn shi shn shu si sid sio sit sk sl sla sm sma smi smj smn sms sn snk so sog son ' +
  'sq sr srn srr ss ssa ssy st su suk sus sux sv sw swb syc syr ta tai te tem teo ter tet tg th ti tig ' +
  'tiv tk tkl tlh tli tmh tn to tog tpi tr trv ts tsi tt tum tup tut tvl tw twq ty tyv tzm udm ug uga ' +
  'uk umb und ur uz vai ve vi vo vot vun wa wae wak wal war was wen wo xal xh xog yao yap yav ybb yi yo ' +
  'ypk yue za zap zbl zen zh znd zu zun zxx zza ' +
  ''
).trim().split(' ')

const _languages3 = (
  'aar abk ace ach ada ady ave aeb afr afh agq ain aka akk akz ale aln alt amh arg ang anp ara arc arn ' +
  'aro arp arq ars arw ary arz asm asa ase ast ava avk awa aym aze bak bal ban bar bas bax bbc bbj bel ' +
  'bej bem bew bez bfd bfq bul bgc bgn bho bis bik bin bjn bkm bla bam ben bod bpy bqi bre bra brh brx ' +
  'bos bss bua bug bum byn byv cat cad car cay cch ccp che ceb cgg cha chb chg chk chm chn cho chp chr ' +
  'chy ckb cos cop cps cre crh ces csb chu chv cym dan dak dar dav day deu del den dgr din dje doi dra ' +
  'dsb dua dum div dyo dyu dzo dzg ebu ewe efi egy eka ell elx eng enm epo spa est eus ewo fas fan fat ' +
  'ful fin fil fiu fij fao fon fra frm fro frr frs fur fry gle gaa gay gba gla gem gez gil glg gmh grn ' +
  'goh gon gor got grb grc gsw guj guz glv gwi hau hai haw heb hin hil him hit hmn hmo hrv hsb hat hun ' +
  'hup hye her ina iba ibb ind ile ibo iii ijo ipk ilo inc ine inh ido ira iro isl ita iku jpn jbo jgo ' +
  'jmc jpr jrb jav kat kaa kab kac kaj kam kar kaw kbd kbl kcg kde kea kfo kon kha khi kho khq kik kua ' +
  'kaz kkj kal kln khm kmb kan kor kok kos kpe kau krc krl kro kru kas ksb ksf ksh kur kum kut kom cor ' +
  'kir lat lad lag lah lam ltz lez lug lim lkt lin lao lol loz lit lub lua lui lun luo lus luy lav mad ' +
  'maf mag mai mak man map mas mde mdf mdr men mer mfe mlg mga mgh mgo mah mri mic min mis mkd mkh mal ' +
  'mon mnc mni mno moh mos mar msa mlt mua mul mun mus mwl mwr mya mye myn myv nau nah nai nap naq nob ' +
  'nde nds nep new ndo nia nic niu nld nmg nno nnh nor nog non nqo nbl nso nub nus nav nwc nya nym nyn ' +
  'nyo nzi oci oji orm ori oss osa ota oto pan paa pag pal pam pap pau peo phi phn pli pol pon pra pro ' +
  'pus por que raj rap rar roh run ron roa rof rom rus rup kin rwk san sad sah sai sal sam saq sas sat ' +
  'sba sbp srd scn sco snd sme see seh sel sem ses sag sga sgn shi shn shu sin sid sio sit slk slv sla ' +
  'smo sma smi smj smn sms sna snk som sog son sqi srp srn srr ssw ssa ssy sot sun suk sus sux swe swa ' +
  'swb syc syr tam tai tel tem teo ter tet tgk tha tir tig tiv tuk tkl tlh tli tmh tsn ton tog tpi tur ' +
  'trv tso tsi tat tum tup tut tvl twi twq tah tyv tzm udm uig uga ukr umb und urd uzb vai ven vie vol ' +
  'vot vun wln wae wak wal war was wen wol xal xho xog yao yap yav ybb yid yor ypk yue zha zap zbl zen ' +
  'zho znd zul zun zxx zza ' +
  ''
).trim().split(' ')

const _obsoleteLanguages = ['in', 'iw', 'ji', 'jw', 'mo', 'sh']
const _obsoleteLanguages3 = ['ind', 'heb', 'yid', 'jaw', 'ron', 'srp']

function threeToTwoLetterLanguage(lang: string): string | null {
  let offset = _languages3.indexOf(lang)
  if (offset >= 0) return _languages[offset] as string
  offset = _obsoleteLanguages3.indexOf(lang)
  if (offset >= 0) return _obsoleteLanguages[offset] as string
  return null
}

// --- KeyTypeData (aller-retour BCP 47 -> legacy -> BCP 47, voir en-tête) ---

// prettier-ignore
const KEYTYPE_ALIASES: Record<string, Record<string, string>> = {
  ca: { 'ethiopic-amete-alem': 'ethioaa', islamicc: 'islamic-civil' },
  d0: { name: 'charname' },
  kb: { yes: 'true' },
  kc: { yes: 'true' },
  kh: { yes: 'true' },
  kk: { yes: 'true' },
  kn: { yes: 'true' },
  ks: { primary: 'level1', tertiary: 'level3' },
  m0: { 'beta-metsehaf': 'betamets', 'ies-jes': 'iesjes', names: 'prprname', 'tekie-alibekit': 'tekieali' },
  ms: { imperial: 'uksystem' },
  tz: { aqams: 'aqmcm', aukns: 'auhba', caffs: 'cawnp', camtr: 'cator', canpg: 'cator', capnt: 'caiql', cathu: 'cator', cayzf: 'caedm', cet: 'bebru', cnckg: 'cnsha', cnhrb: 'cnsha', cnkhg: 'cnurc', cst6cdt: 'uschi', cuba: 'cuhav', eet: 'grath', egypt: 'egcai', eire: 'iedub', est: 'papty', est5edt: 'usnyc', factory: 'unk', gaza: 'gazastrp', gmt0: 'gmt', hongkong: 'hkhkg', hst: 'ushnl', iceland: 'isrey', iran: 'irthr', israel: 'jeruslm', jamaica: 'jmkin', japan: 'jptyo', libya: 'lytip', met: 'bebru', mncoq: 'mnuln', mst: 'usphx', mst7mdt: 'usden', mxstis: 'mxtij', navajo: 'usden', poland: 'plwaw', portugal: 'ptlis', prc: 'cnsha', pst8pdt: 'uslax', roc: 'twtpe', rok: 'krsel', turkey: 'trist', uaozh: 'uaiev', uauzh: 'uaiev', uct: 'utc', umjon: 'ushnl', usnavajo: 'usden', wet: 'ptlis', zulu: 'utc' },
}

// ULocale.toLegacyKey + ULocale.toUnicodeLocaleKey : l'aller-retour conserve la clé BCP 47 (en minuscules)
// ULocale.toLegacyType + ULocale.toUnicodeLocaleType : l'aller-retour conserve le type, sauf alias
function roundTripUnicodeLocaleType(bcpKey: string, bcpType: string): string {
  return KEYTYPE_ALIASES[bcpKey]?.[bcpType] ?? bcpType
}

// --- LocaleIDParser ---

const DONE = '\uffff'
const KEYWORD_SEPARATOR = '@'
const HYPHEN = '-'
const KEYWORD_ASSIGN = '='
const COMMA = ','
const ITEM_SEPARATOR = ';'
const DOT = '.'
const UNDERSCORE = '_'
const MAX_VARIANTS_LENGTH = 179

// Java String.trim() : retire les caractères <= U+0020
function javaTrim(s: string): string {
  return s.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '')
}

class LocaleIDParser {
  private readonly id: string
  private index = 0
  private buffer = ''
  private hadCountry = false
  private keywords: Map<string, string> | null = null

  constructor(localeID: string) {
    this.id = localeID
  }

  private reset(): void {
    this.index = 0
    this.buffer = ''
  }
  private append(s: string): void {
    this.buffer += s
  }
  private addSeparator(): void {
    this.append(UNDERSCORE)
  }
  private getString(start: number): string {
    return this.buffer.substring(start)
  }
  private set(pos: number, s: string): void {
    this.buffer = this.buffer.substring(0, pos) + s
  }
  private next(): string {
    if (this.index === this.id.length) {
      this.index++
      return DONE
    }
    return this.id.charAt(this.index++)
  }
  private skipUntilTerminatorOrIDSeparator(): void {
    while (!this.isTerminatorOrIDSeparator(this.next()));
    --this.index
  }
  private atTerminator(): boolean {
    return this.index >= this.id.length || this.isTerminator(this.id.charAt(this.index))
  }
  private isTerminator(c: string): boolean {
    return c === KEYWORD_SEPARATOR || c === DONE || c === DOT
  }
  private isTerminatorOrIDSeparator(c: string): boolean {
    return c === UNDERSCORE || c === HYPHEN || this.isTerminator(c)
  }
  private haveExperimentalLanguagePrefix(): boolean {
    if (this.id.length > 2) {
      let c = this.id.charAt(1)
      if (c === HYPHEN || c === UNDERSCORE) {
        c = this.id.charAt(0)
        return c === 'x' || c === 'X' || c === 'i' || c === 'I'
      }
    }
    return false
  }
  private haveKeywordAssign(): boolean {
    for (let i = this.index; i < this.id.length; ++i) if (this.id.charAt(i) === KEYWORD_ASSIGN) return true
    return false
  }

  private parseLanguage(): number {
    const startLength = this.buffer.length
    if (this.haveExperimentalLanguagePrefix()) {
      this.append(toLowerChar(this.id.charAt(0)))
      this.append(HYPHEN)
      this.index = 2
    }
    let c: string
    while (!this.isTerminatorOrIDSeparator((c = this.next()))) this.append(toLowerChar(c))
    --this.index
    if (this.buffer.length - startLength === 3) {
      const lang = threeToTwoLetterLanguage(this.getString(0))
      if (lang !== null) this.set(0, lang)
    }
    return 0
  }
  private skipLanguage(): void {
    if (this.haveExperimentalLanguagePrefix()) this.index = 2
    this.skipUntilTerminatorOrIDSeparator()
  }

  private parseScript(): number {
    if (!this.atTerminator()) {
      const oldIndex = this.index
      ++this.index
      let oldBlen = this.buffer.length
      let c: string
      let firstPass = true
      while (!this.isTerminatorOrIDSeparator((c = this.next())) && isAlpha(c)) {
        if (firstPass) {
          this.addSeparator()
          this.append(toUpperChar(c))
          firstPass = false
        } else {
          this.append(toLowerChar(c))
        }
      }
      --this.index
      if (this.index - oldIndex !== 5) {
        this.index = oldIndex
        this.buffer = this.buffer.substring(0, oldBlen)
      } else {
        oldBlen++
      }
      return oldBlen
    }
    return this.buffer.length
  }
  private skipScript(): void {
    if (!this.atTerminator()) {
      const oldIndex = this.index
      ++this.index
      let c: string
      while (!this.isTerminatorOrIDSeparator((c = this.next())) && isAlpha(c));
      --this.index
      if (this.index - oldIndex !== 5) this.index = oldIndex
    }
  }

  private parseCountry(): number {
    if (!this.atTerminator()) {
      const oldIndex = this.index
      ++this.index
      let oldBlen = this.buffer.length
      let c: string
      let firstPass = true
      while (!this.isTerminatorOrIDSeparator((c = this.next()))) {
        if (firstPass) {
          this.hadCountry = true
          this.addSeparator()
          ++oldBlen
          firstPass = false
        }
        this.append(toUpperChar(c))
      }
      --this.index
      const charsAppended = this.buffer.length - oldBlen
      if (charsAppended === 0) {
        // Do nothing.
      } else if (charsAppended < 2 || charsAppended > 3) {
        this.index = oldIndex
        --oldBlen
        this.buffer = this.buffer.substring(0, oldBlen)
        this.hadCountry = false
      } else if (charsAppended === 3) {
        // PORT: LocaleIDs.threeToTwoLetterRegion non porté (région alpha-3 impossible sur ce chemin, voir en-tête)
      }
      return oldBlen
    }
    return this.buffer.length
  }
  private skipCountry(): void {
    if (!this.atTerminator()) {
      const ch = this.id.charAt(this.index)
      if (ch === UNDERSCORE || ch === HYPHEN) ++this.index
      const oldIndex = this.index
      this.skipUntilTerminatorOrIDSeparator()
      const charsSkipped = this.index - oldIndex
      if (charsSkipped < 2 || charsSkipped > 3) this.index = oldIndex
    }
  }

  private parseVariant(): number {
    let oldBlen = this.buffer.length
    let start = true
    let needSeparator = true
    let skipping = false
    let c: string
    let firstPass = true

    while ((c = this.next()) !== DONE) {
      if (c === DOT) {
        start = false
        skipping = true
      } else if (c === KEYWORD_SEPARATOR) {
        if (this.haveKeywordAssign()) break
        skipping = false
        start = false
        needSeparator = true
      } else if (start) {
        start = false
        if (c !== UNDERSCORE && c !== HYPHEN) this.index--
      } else if (!skipping) {
        if (needSeparator) {
          needSeparator = false
          if (firstPass && !this.hadCountry) {
            this.addSeparator()
            ++oldBlen
          }
          this.addSeparator()
          if (firstPass) {
            ++oldBlen
            firstPass = false
          }
        }
        c = toUpperChar(c)
        if (c === HYPHEN || c === COMMA) c = UNDERSCORE
        this.append(c)
        if (this.buffer.length - oldBlen > MAX_VARIANTS_LENGTH) throw new IllegalArgumentException('variants is too long')
      }
    }
    --this.index
    return oldBlen
  }

  getLanguage(): string {
    this.reset()
    return this.getString(this.parseLanguage())
  }
  getScript(): string {
    this.reset()
    this.skipLanguage()
    return this.getString(this.parseScript())
  }
  getCountry(): string {
    this.reset()
    this.skipLanguage()
    this.skipScript()
    return this.getString(this.parseCountry())
  }
  getVariant(): string {
    this.reset()
    this.skipLanguage()
    this.skipScript()
    this.skipCountry()
    return this.getString(this.parseVariant())
  }

  private parseBaseName(): void {
    this.reset()
    this.parseLanguage()
    this.parseScript()
    this.parseCountry()
    this.parseVariant()
    const len = this.buffer.length
    if (len > 0 && this.buffer.charAt(len - 1) === UNDERSCORE) this.buffer = this.buffer.substring(0, len - 1)
  }

  getName(): string {
    this.parseBaseName()
    this.parseKeywords()
    return this.getString(0)
  }

  private setToKeywordStart(): boolean {
    for (let i = this.index; i < this.id.length; ++i) {
      if (this.id.charAt(i) === KEYWORD_SEPARATOR) {
        if (++i < this.id.length) {
          this.index = i
          return true
        }
        break
      }
    }
    return false
  }
  private getKeyword(): string {
    const start = this.index
    while (!(((c) => c === DONE || c === KEYWORD_ASSIGN)(this.next())));
    --this.index
    return toLowerString(javaTrim(this.id.substring(start, this.index)))
  }
  private getValue(): string {
    const start = this.index
    while (!(((c) => c === DONE || c === ITEM_SEPARATOR)(this.next())));
    --this.index
    return javaTrim(this.id.substring(start, this.index))
  }

  getKeywordMap(): Map<string, string> {
    if (this.keywords === null) {
      let m: Map<string, string> | null = null
      if (this.setToKeywordStart()) {
        do {
          const key = this.getKeyword()
          if (key.length === 0) break
          const c = this.next()
          if (c !== KEYWORD_ASSIGN) {
            if (c === DONE) break
            else continue
          }
          const value = this.getValue()
          if (value.length === 0) continue
          if (m === null) m = new Map()
          else if (m.has(key)) continue
          m.set(key, value)
        } while (this.next() === ITEM_SEPARATOR)
      }
      this.keywords = m !== null ? new Map([...m].sort(([a], [b]) => javaCompare(a, b))) : new Map()
    }
    return this.keywords
  }

  private parseKeywords(): number {
    let oldBlen = this.buffer.length
    const m = this.getKeywordMap()
    if (m.size > 0) {
      let first = true
      for (const [k, v] of m) {
        this.append(first ? KEYWORD_SEPARATOR : ITEM_SEPARATOR)
        first = false
        this.append(k)
        this.append(KEYWORD_ASSIGN)
        this.append(v)
      }
      if (!first) ++oldBlen
    }
    return oldBlen
  }
}

// --- ULocale ---

const LOCALE_ATTRIBUTE_KEY = 'attribute'
const UNDEFINED_LANGUAGE = 'und'

function getShortestSubtagLength(localeID: string): number {
  const localeIDLength = localeID.length
  let length = localeIDLength
  let reset = true
  let tmpLength = 0
  for (let i = 0; i < localeIDLength; i++) {
    const ch = localeID.charAt(i)
    if (ch !== '_' && ch !== '-') {
      if (reset) {
        reset = false
        tmpLength = 0
      }
      tmpLength++
    } else {
      if (tmpLength !== 0 && tmpLength < length) length = tmpLength
      reset = true
    }
  }
  return length
}

function stripLeadingUnd(localeID: string): string {
  const length = localeID.length
  if (length < 3) return localeID
  if (!caseIgnoreMatch(localeID.substring(0, 3), 'und')) return localeID
  if (length === 3) return ''
  const separator = localeID.charAt(3)
  if (separator === '-' || separator === '_') return localeID.substring(3)
  return localeID
}

function lscvToID(lang: string, script: string, country: string, variant: string): string {
  let buf = ''
  if (lang.length > 0) buf += lang
  if (script.length > 0) buf += UNDERSCORE + script
  if (country.length > 0) buf += UNDERSCORE + country
  if (variant.length > 0) {
    if (country.length === 0) buf += UNDERSCORE
    buf += UNDERSCORE + variant
  }
  return buf
}

export class ULocale {
  private readonly localeID: string
  private baseLocale: BaseLocale | null = null
  private extensions_: LocaleExtensions | null = null

  private constructor(localeID: string) {
    this.localeID = ULocale.getName(localeID)
  }

  static getISOLanguages(): string[] {
    return [..._languages]
  }

  static getName(localeID: string): string {
    let tmpLocaleID = localeID
    if (!localeID.includes('@') && getShortestSubtagLength(localeID) === 1) {
      if (localeID.indexOf('_') >= 0 && localeID.charAt(1) !== '_' && localeID.charAt(1) !== '-') {
        tmpLocaleID = localeID.replaceAll('_', '-')
      }
      tmpLocaleID = ULocale.forLanguageTag(tmpLocaleID).localeID
      if (tmpLocaleID.length === 0) tmpLocaleID = localeID
    } else if (caseIgnoreMatch(localeID, 'root')) {
      tmpLocaleID = ''
    } else {
      tmpLocaleID = stripLeadingUnd(localeID)
    }
    return new LocaleIDParser(tmpLocaleID).getName()
  }

  static forLanguageTag(languageTag: string): ULocale {
    const tag = LanguageTag.parse(languageTag, new ParseStatus())
    const bldr = new InternalLocaleBuilder()
    bldr.setLanguageTag(tag)
    return ULocale.getInstance(bldr.getBaseLocale(), bldr.getLocaleExtensions())
  }

  private static getInstance(base: BaseLocale, exts: LocaleExtensions): ULocale {
    let id = lscvToID(base.language, base.script, base.region, base.variant)

    const extKeys = exts.getKeys()
    if (extKeys.length > 0) {
      // TreeMap<String, String> (trié à la fin)
      const kwds = new Map<string, string>()
      for (const key of extKeys) {
        const ext = exts.getExtension(key) as Extension
        if (ext instanceof UnicodeLocaleExtension) {
          for (const [bcpKey, bcpType] of ext.keywords) {
            // PORT: toLegacyKey/toLegacyType puis toUnicodeLocaleKey/toUnicodeLocaleType (extensions())
            // remplacés par l'aller-retour équivalent (voir KEYTYPE_ALIASES) ; la valeur "legacy" est ici la valeur BCP 47 finale
            const lkey = bcpKey
            const ltype = roundTripUnicodeLocaleType(bcpKey, bcpType.length === 0 ? 'yes' : bcpType)
            if (lkey === 'va' && ltype === 'posix' && base.variant.length === 0) {
              id = id + '_POSIX'
            } else {
              kwds.set(lkey, ltype)
            }
          }
          if (ext.attributes.length > 0) kwds.set(LOCALE_ATTRIBUTE_KEY, ext.attributes.join('-'))
        } else {
          kwds.set(key, ext.getValue())
        }
      }

      if (kwds.size > 0) {
        id += '@' + [...kwds].sort(([a], [b]) => javaCompare(a, b)).map(([k, v]) => `${k}=${v}`).join(';')
      }
    }
    return new ULocale(id)
  }

  private base(): BaseLocale {
    if (this.baseLocale === null) {
      let language = ''
      let script = ''
      let region = ''
      let variant = ''
      if (this.localeID !== '') {
        const lp = new LocaleIDParser(this.localeID)
        language = lp.getLanguage()
        script = lp.getScript()
        region = lp.getCountry()
        variant = lp.getVariant()
      }
      this.baseLocale = new BaseLocale(language, script, region, variant)
    }
    return this.baseLocale
  }

  private extensions(): LocaleExtensions {
    if (this.extensions_ === null) {
      const kw = new LocaleIDParser(this.localeID).getKeywordMap()
      if (kw.size === 0) {
        this.extensions_ = EMPTY_EXTENSIONS
      } else {
        const intbld = new InternalLocaleBuilder()
        for (const [key, value] of kw) {
          try {
            if (key === LOCALE_ATTRIBUTE_KEY) {
              for (const uattr of value.split(/[-_]/)) {
                try {
                  intbld.addUnicodeLocaleAttribute(uattr)
                } catch (e) {
                  if (!(e instanceof LocaleSyntaxException)) throw e
                }
              }
            } else if (key.length >= 2) {
              // PORT: toUnicodeLocaleKey/toUnicodeLocaleType : la valeur est déjà la valeur BCP 47 finale (voir getInstance)
              if (isUnicodeKey(key)) intbld.setUnicodeLocaleKeyword(key, toLowerString(value))
            } else if (key.length === 1 && key !== 'u') {
              intbld.setExtension(key, value.replaceAll('_', SEP))
            }
          } catch (e) {
            if (!(e instanceof LocaleSyntaxException)) throw e
          }
        }
        this.extensions_ = intbld.getLocaleExtensions()
      }
    }
    return this.extensions_
  }

  /** `getLanguage()` */
  get language(): string {
    return this.base().language
  }

  toLanguageTag(): string {
    let base = this.base()
    let exts = this.extensions()

    if (caseIgnoreMatch(base.variant, 'POSIX')) {
      base = new BaseLocale(base.language, base.script, base.region, '')
      if (exts.getUnicodeLocaleType('va') === null) {
        const ilocbld = new InternalLocaleBuilder()
        ilocbld.setLocale(BASELOCALE_ROOT, exts)
        ilocbld.setUnicodeLocaleKeyword('va', 'posix')
        exts = ilocbld.getLocaleExtensions()
      }
    }

    const tag = LanguageTag.parseLocale(base, exts)

    let buf = ''
    let subtag = tag._language
    if (subtag.length > 0) buf += toLowerString(subtag)

    subtag = tag._script
    if (subtag.length > 0) buf += SEP + toTitleString(subtag)

    subtag = tag._region
    if (subtag.length > 0) buf += SEP + toUpperString(subtag)

    const variants = [...tag._variants].sort(javaCompare)
    for (const s of variants) buf += SEP + toLowerString(s)

    for (const s of tag._extensions) buf += SEP + LanguageTag.canonicalizeExtension(s)

    subtag = tag._privateuse
    if (subtag.length > 0) {
      if (buf.length === 0) buf += UNDEFINED_LANGUAGE
      buf += SEP + PRIVATEUSE + SEP + toLowerString(subtag)
    }

    return buf
  }
}
