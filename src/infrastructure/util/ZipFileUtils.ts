// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/util/ZipFileUtils.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { EntryNotFoundException } from '../../domain/model/Exceptions.js'
import { ZipFile, type ZipFileBuilder } from '../../port/commons-compress.js'
import { type InputStream, use as useCloseable } from '../../port/java-io.js'

// PORT: fonction d'extension inline ZipFile.Builder.use -> fonction `use(builder, block)`
export function use<R>(self: ZipFileBuilder, block: (zip: ZipFile) => R): R {
  return useCloseable(self.get(), block)
}

export function getEntryInputStream(self: ZipFile, entryName: string): InputStream | null {
  const entry = self.getEntry(entryName)
  return entry !== null ? self.getInputStream(entry) : null
}

export function getEntryBytes(self: ZipFile, entryName: string): Uint8Array | null {
  const entry = self.getEntry(entryName)
  return entry !== null ? useCloseable(self.getInputStream(entry), (it) => it.readBytes()) : null
}

export function getZipEntryBytes(path: string, entryName: string): Uint8Array {
  // fast path. Only read central directory record and try to find entry in it
  const zipBuilder = ZipFile.builder().setPath(path).setUseUnicodeExtraFields(true).setIgnoreLocalFileHeader(true)
  const bytes = use(zipBuilder, (it) => getEntryBytesClosing(it, entryName))
  if (bytes !== null) return bytes

  // slow path. Entry with that name wasn't in central directory record
  // Iterate each entry and, if present, set name from Unicode extra field in local file header
  return use(zipBuilder.setIgnoreLocalFileHeader(false), (it) => {
    const b = getEntryBytesClosing(it, entryName)
    if (b === null) throw new EntryNotFoundException(`Entry does not exist: ${entryName}`)
    return b
  })
}

function getEntryBytesClosing(self: ZipFile, entryName: string): Uint8Array | null {
  return useCloseable(self, (zip) => {
    const entry = zip.getEntry(entryName)
    return entry !== null ? useCloseable(zip.getInputStream(entry), (it) => it.readBytes()) : null
  })
}
