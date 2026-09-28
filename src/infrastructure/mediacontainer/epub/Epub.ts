// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/Epub.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { MediaUnsupportedException } from '../../../domain/model/Exceptions.js'
import { type ZipFile, ZipFile as ZipFileClass } from '../../../port/commons-compress.js'
import { use as useCloseable } from '../../../port/java-io.js'
import { pathParent, pathsGet } from '../../../port/java-nio-file.js'
import { type Document, Jsoup, Parser } from '../../../port/jsoup.js'
import { DataClass } from '../../../port/kotlin.js'
import { getEntryInputStream, use } from '../../util/ZipFileUtils.js'
import type { ManifestItem } from './ManifestItem.js'
import { getManifest } from './Opf.js'

type EpubPackageParams = {
  zip: ZipFile
  opfDoc: Document
  opfDir: string | null
  manifest: Map<string, ManifestItem>
}

export class EpubPackage extends DataClass<EpubPackageParams> {
  readonly zip: ZipFile
  readonly opfDoc: Document
  readonly opfDir: string | null
  readonly manifest: Map<string, ManifestItem>

  constructor({ zip, opfDoc, opfDir, manifest }: EpubPackageParams) {
    super()
    this.zip = zip
    this.opfDoc = opfDoc
    this.opfDir = opfDir
    this.manifest = manifest
  }
}

export function epub<R>(self: string, block: (epub: EpubPackage) => R): R {
  return use(ZipFileClass.builder().setPath(self), (zip) => {
    const opfFile = getPackagePath(zip)
    const stream = getEntryInputStream(zip, opfFile)
    const opfDoc = stream !== null ? useCloseable(stream, (it) => Jsoup.parse(it, null, '', Parser.xmlParser())) : null
    if (opfDoc === null) throw new MediaUnsupportedException('Could not open OPF resource')
    const opfDir = pathParent(pathsGet(opfFile))
    return block(new EpubPackage({ zip: zip, opfDoc: opfDoc, opfDir: opfDir, manifest: getManifest(opfDoc) }))
  })
}

/**
 * Returns the zip entry path of the Epub package file
 */
export function getPackagePath(self: ZipFile): string {
  const stream = getEntryInputStream(self, 'META-INF/container.xml')
  const rootfile = stream !== null ? (useCloseable(stream, (it) => Jsoup.parse(it, null, '', Parser.xmlParser())).getElementsByTag('rootfile')[0] ?? null) : null
  const path = rootfile?.attr('full-path') ?? null
  if (path === null) throw new MediaUnsupportedException('META-INF/container.xml does not contain rootfile tag')
  return path
}

/**
 * Returns the content of the Epub package file as a [String]
 */
export function getPackageFileContent(path: string): string | null {
  return use(ZipFileClass.builder().setPath(path), (zip) => {
    try {
      const stream = getEntryInputStream(zip, getPackagePath(zip))
      return stream !== null ? useCloseable(stream, (it) => new TextDecoder().decode(it.readBytes())) : null
    } catch {
      return null
    }
  })
}
