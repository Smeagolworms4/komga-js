// @port-of komga/src/test/kotlin/org/gotson/komga/domain/model/BookMetadataTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { BookMetadata } from '../../../src/domain/model/BookMetadata.js'

describe('BookMetadataTest', () => {
  it('given untrimmed parameters when creating object then fields are trimmed', () => {
    const metadata = new BookMetadata({ title: '  title  ', number: '  number  ', numberSort: 1 })

    expect(metadata.title).toBe('title')
    expect(metadata.number).toBe('number')
  })
})
