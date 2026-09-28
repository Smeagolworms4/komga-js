// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/Ncx.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { EpubTocEntry } from '../../../domain/model/EpubTocEntry.js'
import { urlDecode } from '../../../port/java-net-urldecoder.js'
import { pathParent } from '../../../port/java-nio-file.js'
import { type Element, Jsoup, Parser } from '../../../port/jsoup.js'
import { firstOrNull, mapNotNull } from '../../../port/kotlin.js'
import { getEntryBytes } from '../../util/ZipFileUtils.js'
import type { EpubPackage } from './Epub.js'
import type { Epub2Nav } from './Epub2Nav.js'
import { normalizeHref } from './Opf.js'
import { ResourceContent } from './ResourceContent.js'

const possibleNcxItemIds = ['toc', 'ncx', 'ncxtoc']

export function getNcxResource(self: EpubPackage): ResourceContent | null {
  const ncx = firstOrNull(self.manifest.values(), (it) => it.mediaType === 'application/x-dtbncx+xml') ?? firstOrNull(self.manifest.values(), (it) => possibleNcxItemIds.includes(it.id))
  if (ncx === null) return null
  const href = normalizeHref(self.opfDir, ncx.href)
  const bytes = getEntryBytes(self.zip, href)
  if (bytes === null) return null
  const ncxContent = new TextDecoder().decode(bytes)
  return new ResourceContent({ path: href, content: ncxContent })
}

export function processNcx(document: ResourceContent, navType: Epub2Nav): EpubTocEntry[] {
  return mapNotNull(Jsoup.parse(document.content, '', Parser.xmlParser()).select(`${navType.level1} > ${navType.level2}`), (it) => ncxElementToTocEntry(navType, it, pathParent(document.path)))
}

function ncxElementToTocEntry(navType: Epub2Nav, element: Element, ncxDir: string | null): EpubTocEntry | null {
  const title = element.selectFirst('navLabel > text')?.text() ?? null
  const content = element.selectFirst('content')
  const href = content !== null ? urlDecode(content.attr('src')) : null
  const children = mapNotNull(element.select(`:root > ${navType.level2}`), (it) => ncxElementToTocEntry(navType, it, ncxDir))
  if (title !== null) return new EpubTocEntry({ title: title, href: href !== null ? normalizeHref(ncxDir, href) : null, children: children })
  return null
}
