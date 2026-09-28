// Support de portage : java.net.URLDecoder.decode(s, UTF_8), sans jumeau Kotlin.
import { IllegalArgumentException } from './kotlin.js'

/** `URLDecoder.decode(s, Charsets.UTF_8)` : `+` -> espace, séquences `%XX` décodées en UTF-8 (remplacement U+FFFD) */
export function urlDecode(s: string): string {
  let out = ''
  let i = 0
  const numChars = s.length
  while (i < numChars) {
    const c = s[i] as string
    if (c === '+') {
      out += ' '
      i++
    } else if (c === '%') {
      const bytes: number[] = []
      while (i + 2 < numChars && s[i] === '%') {
        const hex = s.substring(i + 1, i + 3)
        const v = /^[0-9a-fA-F-+]+$/.test(hex) ? parseInt(hex, 16) : NaN
        if (Number.isNaN(v) || v < 0) throw new IllegalArgumentException(`URLDecoder: Illegal hex characters in escape (%) pattern - Error at index 0 in: "${hex}"`)
        bytes.push(v & 0xff)
        i += 3
      }
      if (i < numChars && s[i] === '%') throw new IllegalArgumentException('URLDecoder: Incomplete trailing escape (%) pattern')
      out += new TextDecoder('utf-8').decode(new Uint8Array(bytes))
    } else {
      out += c
      i++
    }
  }
  return out
}
