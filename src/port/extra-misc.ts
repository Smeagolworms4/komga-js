// Support de portage : helpers génériques divers (sans jumeau Kotlin).

// ---------------------------------------------------------------------------
// ByteArray (kotlin.collections)
// ---------------------------------------------------------------------------

/** `ByteArray?.contentEquals(ByteArray?)` : égalité élément par élément (deux null sont égaux). */
export function contentEquals(a: Uint8Array | null | undefined, b: Uint8Array | null | undefined): boolean {
  if (a === b) return true
  if (a === null || a === undefined || b === null || b === undefined) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** `ByteArray?.contentHashCode()` = `java.util.Arrays.hashCode(byte[])` (octets signés, null donne 0). */
export function contentHashCode(a: Uint8Array | null | undefined): number {
  if (a === null || a === undefined) return 0
  let result = 1
  for (let i = 0; i < a.length; i++) result = (31 * result + (((a[i] as number) << 24) >> 24)) | 0
  return result
}
