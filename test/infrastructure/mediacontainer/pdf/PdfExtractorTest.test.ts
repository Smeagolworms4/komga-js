// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/mediacontainer/pdf/PdfExtractorTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ImageType } from '../../../../src/infrastructure/image/ImageType.js'
import { PdfExtractor } from '../../../../src/infrastructure/mediacontainer/pdf/PdfExtractor.js'

describe('PdfExtractorTest', () => {
  const pdfExtractor = new PdfExtractor(ImageType.JPEG, 1000)

  it('given pdf file when getting pages then pages are returned', () => {
    const fileResource = fileURLToPath(new URL('../../../resources/pdf/komga.pdf', import.meta.url))

    const pages = pdfExtractor.getPages(fileResource, true)

    expect(pages).toHaveLength(1)
    expect(pages[0]?.dimension?.width).toBe(512)
  })
})
