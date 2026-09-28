// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/Opf.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { EpubTocEntry } from '../../../domain/model/EpubTocEntry.js'
import { urlDecode } from '../../../port/java-net-urldecoder.js'
import { pathNormalize, pathResolve, pathsGet } from '../../../port/java-nio-file.js'
import type { Document } from '../../../port/jsoup.js'
import { associate, isBlank, isNotBlank } from '../../../port/kotlin.js'
import { ManifestItem } from './ManifestItem.js'

export function getManifest(self: Document): Map<string, ManifestItem> {
  return associate(self.select('*|manifest > *|item'), (it) => [
    it.attr('id'),
    new ManifestItem({
      id: it.attr('id'),
      href: it.attr('href'),
      mediaType: it.attr('media-type'),
      properties: new Set(it.attr('properties').split(' ')),
    }),
  ])
}

// PORT: Path? = string | null ; invariantSeparatorsPathString = la chaîne elle-même (séparateur Unix)
export function normalizeHref(opfDir: string | null, href: string): string {
  const hash = href.lastIndexOf('#')
  const anchor = hash < 0 ? '' : href.substring(hash + 1)
  const base = hash < 0 ? href : href.substring(0, hash)
  const resolvedPath = opfDir !== null ? pathNormalize(pathResolve(opfDir, base)) : pathsGet(base)
  return resolvedPath + (isNotBlank(anchor) ? `#${anchor}` : '')
}

/**
 * Process an OPF document and extracts TOC entries
 * from the <guide> section.
 */
export function processOpfGuide(opf: Document, opfDir: string | null): EpubTocEntry[] {
  const guide = opf.selectFirst('*|guide')
  if (guide === null) return []
  return guide.select('*|reference').map((ref) => {
    const href = ref.attr('href')
    return new EpubTocEntry({
      title: ref.attr('title'),
      href: isBlank(href) ? null : normalizeHref(opfDir, urlDecode(href)),
    })
  })
}
