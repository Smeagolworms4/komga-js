// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/koreader/KoreaderUtils.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { toIntOrNull } from '../../port/kotlin-numbers.js'

const xpathBracketsRegex = /DocFragment\[(\d+)]/i
const xpathNoBracketsRegex = /DocFragment\//i
const anchorRegex = /#_doc_fragment_(\d+)_/i

// PORT: Regex.find(..)?.groups?.get(1)?.value?.toIntOrNull()
function parseGroup(regex: RegExp, input: string): number | null {
  const v = regex.exec(input)?.[1]
  return v !== undefined ? toIntOrNull(v) : null
}

export const KoreaderUtils = {
  /**
   * Try to parse the resource index from a Koreader progress string.
   * @return the 0-based resource index
   */
  parseResourceIndexFromProgressString(progress: string): number | null {
    // capturing group is at index 1, 0 is the full match
    const bracketsIndex = parseGroup(xpathBracketsRegex, progress)
    // KOReader indexing for this format starts at 1
    if (bracketsIndex !== null) return bracketsIndex - 1

    if (xpathNoBracketsRegex.test(progress)) return 0

    // capturing group is at index 1, 0 is the full match
    // KOReader indexing for this format starts at 0
    const anchorIndex = parseGroup(anchorRegex, progress)
    if (anchorIndex !== null) return anchorIndex

    return null
  },
} as const
