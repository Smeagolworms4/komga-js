// Lecture d'une archive zip non compressée (STORED) : entrées nom -> octets (données de test).
export function unzipSync(zip: Buffer): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>()
  let pos = 0
  while (pos + 30 <= zip.length && zip.readUInt32LE(pos) === 0x04034b50) {
    const size = zip.readUInt32LE(pos + 18)
    const nameLen = zip.readUInt16LE(pos + 26)
    const extraLen = zip.readUInt16LE(pos + 28)
    const name = zip.subarray(pos + 30, pos + 30 + nameLen).toString('utf8')
    const start = pos + 30 + nameLen + extraLen
    out.set(name, new Uint8Array(zip.subarray(start, start + size)))
    pos = start + size
  }
  return out
}
