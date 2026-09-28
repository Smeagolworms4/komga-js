// @port-of komga/src/test/kotlin/org/gotson/komga/domain/model/SeriesMetadataTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { SeriesMetadata } from '../../../src/domain/model/SeriesMetadata.js'

describe('SeriesMetadataTest', () => {
  it('given untrimmed parameters when creating object then fields are trimmed', () => {
    const metadata = new SeriesMetadata({ title: '  title  ', titleSort: '  titleSort  ' })

    expect(metadata.title).toBe('title')
    expect(metadata.titleSort).toBe('titleSort')
  })
})
