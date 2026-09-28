// @port-of komga/src/test/kotlin/org/gotson/komga/domain/model/AuthorTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { Author } from '../../../src/domain/model/Author.js'

describe('AuthorTest', () => {
  it('given untrimmed parameters when creating object then fields are trimmed and role is lowercase', () => {
    const author = new Author({ name: '  name  ', role: '  Role  ' })

    expect(author.name).toBe('name')
    expect(author.role).toBe('role')
  })
})
