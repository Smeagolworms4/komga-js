// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/NcxTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EpubTocEntry } from '../../../../src/domain/model/EpubTocEntry.js'
import { Epub2Nav } from '../../../../src/infrastructure/mediacontainer/epub/Epub2Nav.js'
import { processNcx } from '../../../../src/infrastructure/mediacontainer/epub/Ncx.js'
import { ResourceContent } from '../../../../src/infrastructure/mediacontainer/epub/ResourceContent.js'

describe('NcxTest', () => {
  // @ParameterizedTest @MethodSource("paramSource")
  it.each(paramSource())('given ncx document when parsing nav then nav entries are valid', (navType, prefix, expectedProvider) => {
    // given
    const ncxString = new TextDecoder().decode(readFileSync(new URL('../../../resources/epub/toc.ncx', import.meta.url)))

    // when
    // Kotlin : "\${prefix?.let { "\$it/" }}toc.ncx" donne "nulltoc.ncx" quand prefix est null
    const ncxNav = processNcx(new ResourceContent({ path: `${prefix !== null ? `${prefix}/` : 'null'}toc.ncx`, content: ncxString }), navType)

    // then
    const expectedNav = expectedProvider(prefix !== null ? `${prefix}/` : '')

    expect(ncxNav).toEqual(expectedNav)
  })

  function paramSource(): [Epub2Nav, string | null, (prefix: string) => EpubTocEntry[]][] {
    return [
      [Epub2Nav.TOC, null, getExpectedNcxToc],
      [Epub2Nav.TOC, 'PREFIX', getExpectedNcxToc],
      [Epub2Nav.PAGELIST, null, getExpectedNcxPageList],
      [Epub2Nav.PAGELIST, 'PREFIX', getExpectedNcxPageList],
    ]
  }

  function getExpectedNcxToc(prefix = ''): EpubTocEntry[] {
    return [
      new EpubTocEntry({ title: 'COVER', href: `${prefix}Text/Mart_9780553897852_epub_cvi_r1.htm#b02-cvi` }),
      new EpubTocEntry({ title: 'BRAN', href: `${prefix}Text/Mart_9780553897852_epub_c69_r1.htm` }),
      new EpubTocEntry({
        title: 'APPENDIX',
        href: `${prefix}Text/Mart_9780553897852_epub_app_r1.htm`,
        children: [
          new EpubTocEntry({ title: 'THE KINGS AND THEIR COURTS', href: `${prefix}Text/Mart_9780553897852_epub_app_r1.htm#apps01.00` }),
          new EpubTocEntry({ title: 'THE KING ON THE IRON THRONE', href: `${prefix}Text/Mart_9780553897852_epub_app_r1.htm#apps01.01` }),
          new EpubTocEntry({ title: 'THE KING IN THE NARROW SEA', href: `${prefix}Text/Mart_9780553897852_epub_app_r1.htm#apps01.02` }),
          new EpubTocEntry({ title: 'THE KING IN HIGHGARDEN', href: `${prefix}Text/Mart_9780553897852_epub_app_r1.htm#apps01.03` }),
          new EpubTocEntry({ title: 'THE KING IN THE NORTH', href: `${prefix}Text/Mart_9780553897852_epub_app_r1.htm#apps01.04` }),
          new EpubTocEntry({
            title: 'THE QUEEN ACROSS THE WATER',
            href: `${prefix}Text/Mart_9780553897852_epub_app_r1.htm#apps01.05`,
            children: [
              new EpubTocEntry({ title: 'Another level', href: `${prefix}Text/Mart_9780553897852 epub_app_r1.htm#apps01.06` }),
              new EpubTocEntry({ title: 'Yet another level', href: `${prefix}Text/Mart_9780553897852 epub_app_r1.htm#apps01.07` }),
            ],
          }),
        ],
      }),
      new EpubTocEntry({ title: 'ACKNOWLEDGMENTS', href: `${prefix}Text/Mart_9780553897852_epub_ack_r1.htm` }),
      new EpubTocEntry({ title: 'Omake 1: Ichika’s Q&A', href: `${prefix}Text/First Omake - Ichika’s Q&A.xhtml` }),
    ]
  }

  function getExpectedNcxPageList(prefix = ''): EpubTocEntry[] {
    return [
      new EpubTocEntry({ title: 'Cover Page', href: `${prefix}xhtml/cover.xhtml` }),
      new EpubTocEntry({ title: 'iii', href: `${prefix}xhtml/title.xhtml#pg_iii` }),
      new EpubTocEntry({ title: 'v', href: `${prefix}xhtml/dedication.xhtml#pg_v` }),
      new EpubTocEntry({ title: 'vii', href: `${prefix}xhtml/formoreinformation.xhtml#pg_vii` }),
      new EpubTocEntry({ title: 'viii', href: `${prefix}xhtml/formoreinformation.xhtml#pg_viii` }),
      new EpubTocEntry({ title: 'ix', href: `${prefix}xhtml/formoreinformation.xhtml#pg_ix` }),
      new EpubTocEntry({ title: 'x', href: `${prefix}xhtml/formoreinformation.xhtml#pg_x` }),
      new EpubTocEntry({ title: 'xi', href: `${prefix}xhtml/formoreinformation.xhtml#pg_xi` }),
      new EpubTocEntry({ title: '1', href: `${prefix}xhtml/chapter1.xhtml#pg_1` }),
      new EpubTocEntry({ title: '2', href: `${prefix}xhtml/chapter1.xhtml#pg_2` }),
      new EpubTocEntry({ title: '3', href: `${prefix}xhtml/chapter1.xhtml#pg_3` }),
    ]
  }
})
