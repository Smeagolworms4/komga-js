// @port-of komga/src/test/kotlin/org/gotson/komga/domain/model/PageHashTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { PageHash } from '../../../src/domain/model/PageHash.js'

describe('PageHashTest', () => {
  it('given negative size when creating a PageHash then its size is null', () => {
    const pageHash = new PageHash({ hash: 'abc', size: -5 })

    expect(pageHash.size).toBeNull()
  })

  it('given null size when creating a PageHash then its size is null', () => {
    const pageHash = new PageHash({ hash: 'abc', size: null })

    expect(pageHash.size).toBeNull()
  })

  it('given size when creating a PageHash then its size is not null', () => {
    const pageHash = new PageHash({ hash: 'abc', size: 5 })

    expect(pageHash.size).not.toBeNull()
  })
})
