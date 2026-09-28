// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/OpfTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EpubTocEntry } from '../../../../src/domain/model/EpubTocEntry.js'
import { processOpfGuide } from '../../../../src/infrastructure/mediacontainer/epub/Opf.js'
import { pathsGet } from '../../../../src/port/java-nio-file.js'
import { Jsoup, Parser } from '../../../../src/port/jsoup-parser.js'
import { isBlank } from '../../../../src/port/kotlin.js'

describe('OpfTest', () => {
  // @ParameterizedTest @ValueSource(strings = ["", "PREFIX"])
  it.each(['', 'PREFIX'])('given ncx document and opfDir when landmarks TOC then TOC entries are valid', (prefix) => {
    // given
    const opfString = new TextDecoder().decode(readFileSync(new URL('../../../resources/epub/clash.opf', import.meta.url)))
    const opfDoc = Jsoup.parse(opfString, '', Parser.xmlParser())

    // when
    const opfLandmarks = processOpfGuide(opfDoc, isBlank(prefix) ? null : pathsGet(prefix))

    // then
    const expectedToc = getExpectedOpfLandmarks(isBlank(prefix) ? '' : `${prefix}/`)

    expect(opfLandmarks).toEqual(expectedToc)
  })

  function getExpectedOpfLandmarks(prefix = ''): EpubTocEntry[] {
    return [
      new EpubTocEntry({ title: 'Table Of Contents', href: `${prefix}Text/Mart_9780553897852_epub_toc_r1.htm` }),
      new EpubTocEntry({ title: 'Text', href: `${prefix}Text/Mart_9780553897852_epub_prl_r1.htm` }),
      new EpubTocEntry({ title: 'Cover', href: `${prefix}Text/Mart_9780553897852_epub_cvi_r1.htm` }),
    ]
  }
})
