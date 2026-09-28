// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/Nav.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { EpubTocEntry } from '../../../domain/model/EpubTocEntry.js'
import { urlDecode } from '../../../port/java-net-urldecoder.js'
import { pathParent } from '../../../port/java-nio-file.js'
import { type Element, Jsoup, Parser } from '../../../port/jsoup.js'
import { firstOrNull, mapNotNull } from '../../../port/kotlin.js'
import { getEntryBytes } from '../../util/ZipFileUtils.js'
import type { EpubPackage } from './Epub.js'
import type { Epub3Nav } from './Epub3Nav.js'
import { normalizeHref } from './Opf.js'
import { ResourceContent } from './ResourceContent.js'

export function getNavResource(self: EpubPackage): ResourceContent | null {
  const nav = firstOrNull(self.manifest.values(), (it) => it.properties.has('nav'))
  if (nav === null) return null
  const href = normalizeHref(self.opfDir, nav.href)
  const bytes = getEntryBytes(self.zip, href)
  if (bytes === null) return null
  const navContent = new TextDecoder().decode(bytes)
  return new ResourceContent({ path: href, content: navContent })
}

export function processNav(document: ResourceContent, navElement: Epub3Nav): EpubTocEntry[] {
  const doc = Jsoup.parse(document.content, '', Parser.xmlParser())
  const nav = firstOrNull(
    doc.select('nav'),
    // Jsoup selectors cannot find an attribute with namespace
    (it) => it.attributes().some((attr) => attr.key.endsWith('type') && attr.value === navElement.value),
  )
  return nav !== null ? mapNotNull(nav.select(':root > ol > li'), (it) => navLiElementToTocEntry(it, pathParent(document.path))) : []
}

function navLiElementToTocEntry(element: Element, navDir: string | null): EpubTocEntry | null {
  const title = element.selectFirst(':root > a, span')?.text() ?? null
  const a = element.selectFirst(':root > a')
  const href = a !== null ? urlDecode(a.attr('href')) : null
  const children = mapNotNull(element.select(':root > ol > li'), (it) => navLiElementToTocEntry(it, navDir))
  if (title !== null) return new EpubTocEntry({ title: title, href: href !== null ? normalizeHref(navDir, href) : null, children: children })
  return null
}
