// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/util/ZipFileUtils.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { EntryNotFoundException } from '../../domain/model/Exceptions.js'
import { ZipFile, type ZipFileBuilder } from '../../port/commons-compress.js'
import { type InputStream, use as useCloseable } from '../../port/java-io.js'

// PORT: fonction d'extension inline ZipFile.Builder.use -> fonction `use(builder, block)`
export function use<R>(self: ZipFileBuilder, block: (zip: ZipFile) => R): R {
  return useCloseable(self.get(), block)
}

// PORT: `use` avec l'archive ouverte de façon asynchrone (ZipFileBuilder.getAsync) et un bloc asynchrone
export async function useAsync<R>(self: ZipFileBuilder, block: (zip: ZipFile) => Promise<R> | R, opts: { entryBytes?: number } = {}): Promise<R> {
  const zip = await self.getAsync(opts)
  try {
    return await block(zip)
  } finally {
    zip.close()
  }
}

export function getEntryInputStream(self: ZipFile, entryName: string): InputStream | null {
  const entry = self.getEntry(entryName)
  return entry !== null ? self.getInputStream(entry) : null
}

export function getEntryBytes(self: ZipFile, entryName: string): Uint8Array | null {
  const entry = self.getEntry(entryName)
  return entry !== null ? useCloseable(self.getInputStream(entry), (it) => it.readBytes()) : null
}

// PORT: getEntryBytes avec l'entrée lue et décompressée sur le pool de libuv (ZipFile.readEntryBytesAsync)
export async function getEntryBytesAsync(self: ZipFile, entryName: string): Promise<Uint8Array | null> {
  const entry = self.getEntry(entryName)
  return entry !== null ? await self.readEntryBytesAsync(entry) : null
}

// PORT: async (thread unique, voir PORTING.md « Architecture d'exécution ») : archive ouverte et entrée lue et
// décompressée sur le pool de libuv (ZipFileBuilder.getAsync, ZipFile.readEntryBytesAsync), mêmes octets et exceptions
export async function getZipEntryBytes(path: string, entryName: string): Promise<Uint8Array> {
  // fast path. Only read central directory record and try to find entry in it
  const zipBuilder = ZipFile.builder().setPath(path).setUseUnicodeExtraFields(true).setIgnoreLocalFileHeader(true)
  const bytes = await useAsync(zipBuilder, (it) => getEntryBytesClosing(it, entryName))
  if (bytes !== null) return bytes

  // slow path. Entry with that name wasn't in central directory record
  // Iterate each entry and, if present, set name from Unicode extra field in local file header
  return await useAsync(zipBuilder.setIgnoreLocalFileHeader(false), async (it) => {
    const b = await getEntryBytesClosing(it, entryName)
    if (b === null) throw new EntryNotFoundException(`Entry does not exist: ${entryName}`)
    return b
  })
}

// PORT: async (ZipFile.readEntryBytesAsync)
async function getEntryBytesClosing(self: ZipFile, entryName: string): Promise<Uint8Array | null> {
  try {
    const zip = self
    const entry = zip.getEntry(entryName)
    return entry !== null ? await zip.readEntryBytesAsync(entry) : null
  } finally {
    self.close()
  }
}

// PORT: getZipEntryBytes synchrone (l'ancienne forme), pour les lectures faites dans un traitement synchrone
// (positions d'un kepub, voir EpubExtractor.computePositions)
export function getZipEntryBytesBlocking(path: string, entryName: string): Uint8Array {
  const zipBuilder = ZipFile.builder().setPath(path).setUseUnicodeExtraFields(true).setIgnoreLocalFileHeader(true)
  const bytes = use(zipBuilder, (it) => getEntryBytesClosingBlocking(it, entryName))
  if (bytes !== null) return bytes

  return use(zipBuilder.setIgnoreLocalFileHeader(false), (it) => {
    const b = getEntryBytesClosingBlocking(it, entryName)
    if (b === null) throw new EntryNotFoundException(`Entry does not exist: ${entryName}`)
    return b
  })
}

function getEntryBytesClosingBlocking(self: ZipFile, entryName: string): Uint8Array | null {
  return useCloseable(self, (zip) => {
    const entry = zip.getEntry(entryName)
    return entry !== null ? useCloseable(zip.getInputStream(entry), (it) => it.readBytes()) : null
  })
}
