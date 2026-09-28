// Support de portage : fonctions de kotlin.text avec `ignoreCase = true` (StringsKt), sans jumeau Kotlin.
// Kotlin compare caractère par caractère (UTF-16) avec `Char.equals(other, ignoreCase = true)` :
// majuscules simples égales, ou minuscules des majuscules égales. `toUpperCase()` de JS peut produire plusieurs
// caractères (ß -> SS) : dans ce cas le caractère est gardé tel quel, comme Character.toUpperCase(char).

function upperChar(c: string): string {
  const u = c.toUpperCase()
  return u.length === 1 ? u : c
}

function lowerChar(c: string): string {
  const l = c.toLowerCase()
  return l.length === 1 ? l : c
}

/** `Char.equals(other, ignoreCase = true)` */
export function charEqualsIgnoreCase(a: string, b: string): boolean {
  if (a === b) return true
  const au = upperChar(a)
  const bu = upperChar(b)
  return au === bu || lowerChar(au) === lowerChar(bu)
}

/** `regionMatchesImpl(thisOffset, other, otherOffset, length, ignoreCase = true)` */
export function regionMatchesIgnoreCase(s: string, thisOffset: number, other: string, otherOffset: number, length: number): boolean {
  if (otherOffset < 0 || thisOffset < 0 || thisOffset > s.length - length || otherOffset > other.length - length) return false
  for (let i = 0; i < length; i++) if (!charEqualsIgnoreCase(s.charAt(thisOffset + i), other.charAt(otherOffset + i))) return false
  return true
}

/** `indexOf(other, startIndex, ignoreCase = true)` */
export function indexOfIgnoreCase(s: string, other: string, startIndex: number = 0): number {
  const start = Math.max(startIndex, 0)
  const end = s.length
  for (let index = start; index <= end; index++) if (regionMatchesIgnoreCase(other, 0, s, index, other.length)) return index
  return -1
}

/** `contains(other, ignoreCase = true)` */
export function containsIgnoreCase(s: string, other: string): boolean {
  return indexOfIgnoreCase(s, other, 0) >= 0
}

/** `replace(oldValue, newValue, ignoreCase = true)` */
export function replaceIgnoreCase(s: string, oldValue: string, newValue: string): string {
  let occurrenceIndex = indexOfIgnoreCase(s, oldValue, 0)
  // FAST PATH: no match
  if (occurrenceIndex < 0) return s

  const oldValueLength = oldValue.length
  const searchStep = Math.max(oldValueLength, 1)
  let sb = ''

  let i = 0
  do {
    sb += s.substring(i, occurrenceIndex) + newValue
    i = occurrenceIndex + oldValueLength
    if (occurrenceIndex >= s.length) break
    occurrenceIndex = indexOfIgnoreCase(s, oldValue, occurrenceIndex + searchStep)
  } while (occurrenceIndex > 0)
  return sb + s.substring(i, s.length)
}

/** `Regex.matches(input)` : correspondance de toute la chaîne */
export function regexMatches(regex: RegExp, input: string): boolean {
  const r = new RegExp(`^(?:${regex.source})$`, regex.flags.replace(/[gym]/g, ''))
  return r.test(input)
}
