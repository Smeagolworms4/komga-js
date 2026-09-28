// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/NavTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EpubTocEntry } from '../../../../src/domain/model/EpubTocEntry.js'
import { Epub3Nav } from '../../../../src/infrastructure/mediacontainer/epub/Epub3Nav.js'
import { processNav } from '../../../../src/infrastructure/mediacontainer/epub/Nav.js'
import { ResourceContent } from '../../../../src/infrastructure/mediacontainer/epub/ResourceContent.js'

describe('NavTest', () => {
  // @ParameterizedTest @MethodSource("paramSource")
  it.each(paramSource())('given nav document when parsing nav section then nav entries are valid', (navType, prefix, expectedProvider) => {
    // given
    const navString = new TextDecoder().decode(readFileSync(new URL('../../../resources/epub/nav.xhtml', import.meta.url)))

    // when
    // Kotlin : "\${prefix?.let { "\$it/" }}nav.xhtml" donne "nullnav.xhtml" quand prefix est null
    const nav = processNav(new ResourceContent({ path: `${prefix !== null ? `${prefix}/` : 'null'}nav.xhtml`, content: navString }), navType)

    // then
    const expectedNav = expectedProvider(prefix !== null ? `${prefix}/` : '')

    expect(nav).toEqual(expectedNav)
  })

  function paramSource(): [Epub3Nav, string | null, (prefix: string) => EpubTocEntry[]][] {
    return [
      [Epub3Nav.TOC, null, getExpectedNavToc],
      [Epub3Nav.TOC, 'PREFIX', getExpectedNavToc],
      [Epub3Nav.LANDMARKS, null, getExpectedNavLandmarks],
      [Epub3Nav.LANDMARKS, 'PREFIX', getExpectedNavLandmarks],
      [Epub3Nav.PAGELIST, null, getExpectedNavPageList],
      [Epub3Nav.PAGELIST, 'PREFIX', getExpectedNavPageList],
    ]
  }

  function getExpectedNavToc(prefix = ''): EpubTocEntry[] {
    return [
      new EpubTocEntry({ title: 'Cover', href: `${prefix}cover.xhtml` }),
      new EpubTocEntry({ title: 'Title Page', href: `${prefix}titlepage.xhtml` }),
      new EpubTocEntry({ title: 'Copyright', href: `${prefix}copyright.xhtml` }),
      new EpubTocEntry({ title: 'Table of Contents', href: `${prefix}toc.xhtml` }),
      new EpubTocEntry({ title: 'An unlinked heading', href: null }),
      new EpubTocEntry({
        title: 'Introduction',
        href: `${prefix}introduction.xhtml`,
        children: [
          new EpubTocEntry({ title: 'Spring', href: `${prefix}chapter 001.xhtml` }),
          new EpubTocEntry({ title: 'Summer', href: `${prefix}chapter 027.xhtml` }),
          new EpubTocEntry({ title: 'Fall', href: `${prefix}chapter053.xhtml#what:why` }),
          new EpubTocEntry({ title: 'Winter', href: `${prefix}chapter 079.xhtml` }),
        ],
      }),
      new EpubTocEntry({ title: 'Acknowledgments', href: `${prefix}acknowledgements.xhtml` }),
    ]
  }

  function getExpectedNavLandmarks(prefix = ''): EpubTocEntry[] {
    return [new EpubTocEntry({ title: 'Begin Reading', href: `${prefix}cover.xhtml#coverimage` }), new EpubTocEntry({ title: 'Table of Contents', href: `${prefix}toc.xhtml` })]
  }

  function getExpectedNavPageList(prefix = ''): EpubTocEntry[] {
    return [
      new EpubTocEntry({ title: 'Cover Page', href: `${prefix}xhtml/cover.xhtml` }),
      new EpubTocEntry({ title: 'iii', href: `${prefix}xhtml/title.xhtml#pg_iii` }),
      new EpubTocEntry({ title: '1', href: `${prefix}xhtml/chapter1.xhtml#pg_1` }),
      new EpubTocEntry({ title: '2', href: `${prefix}xhtml/chapter1.xhtml#pg_2` }),
      new EpubTocEntry({ title: '107', href: `${prefix}xhtml/acknowledgments.xhtml#pg_107` }),
      new EpubTocEntry({ title: 'ii', href: `${prefix}xhtml/adcard.xhtml#pg_ii` }),
      new EpubTocEntry({ title: '109', href: `${prefix}xhtml/abouttheauthor.xhtml#pg_109` }),
      new EpubTocEntry({ title: 'iv', href: `${prefix}xhtml/copyright.xhtml#pg_iv` }),
    ]
  }
})
