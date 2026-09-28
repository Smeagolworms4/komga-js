// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/mediacontainer/divina/RarExtractorTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { ImageAnalyzer } from '../../../../src/infrastructure/image/ImageAnalyzer.js'
import { ContentDetector } from '../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import { RarExtractor } from '../../../../src/infrastructure/mediacontainer/divina/RarExtractor.js'
import { TikaConfig } from '../../../../src/port/tika.js'

describe('RarExtractorTest', () => {
  const contentDetector = new ContentDetector(new TikaConfig())
  const imageAnalyzer = new ImageAnalyzer()
  const rarExtractor = new RarExtractor(contentDetector, imageAnalyzer)

  it('given rar file when parsing for entries then returns all images', () => {
    const fileResource = fileURLToPath(new URL('../../../resources/archives/rar4.rar', import.meta.url))

    const entries = rarExtractor.getEntries(fileResource, true)

    expect(entries).toHaveLength(3)
    {
      const it = entries[0]!
      expect(it.name).toBe('komga-1.png')
      expect(it.mediaType).toBe('image/png')
      expect(it.dimension).toEqual(new Dimension({ width: 48, height: 48 }))
      expect(it.fileSize).toBe(3108)
    }
  })

  it('given rar file when parsing for entries without analyzing dimensions then returns all images without dimensions', () => {
    const fileResource = fileURLToPath(new URL('../../../resources/archives/rar4.rar', import.meta.url))

    const entries = rarExtractor.getEntries(fileResource, false)

    expect(entries).toHaveLength(3)
    {
      const it = entries[0]!
      expect(it.name).toBe('komga-1.png')
      expect(it.mediaType).toBe('image/png')
      expect(it.dimension).toBeNull()
      expect(it.fileSize).toBe(3108)
    }
  })
})
