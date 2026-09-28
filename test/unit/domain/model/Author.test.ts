// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/AuthorOracleTest.kt
import { Author } from '../../../../src/domain/model/Author.js'
import { contains, distinctSet, eq } from '../../../../src/port/kotlin.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/Author')

const authors = new Map<string, [string, string]>([
  ['plain', ['John Doe', 'writer']],
  ['trimmed', ['  John Doe \t', '  WRITER \n']],
  ['unicode spaces', [' Jöhn ', '　Penciller\u001C']],
  ['empty', ['', '']],
  ['blank', ['   ', '   ']],
  ['special lowercase', ['İsmail', 'İLLUSTRATOR ΣΑΣ']],
  ['bom not trimmed', ['﻿Name', '﻿Role']],
])
const author = (name: string, role: string) => new Author({ name, role })

func('<init>', () => {
  for (const [n, [name, role]] of authors) kase(n, () => author(name, role))
})
func('toString', () => {
  for (const [n, [name, role]] of authors) kase(n, () => author(name, role).toString())
})
func('equals', () => {
  kase('same values', () => eq(author('John', 'writer'), author('John', 'writer')))
  kase('normalized values', () => eq(author(' John ', 'WRITER'), author('John', 'writer')))
  kase('different name', () => eq(author('John', 'writer'), author('Jane', 'writer')))
  kase('different role', () => eq(author('John', 'writer'), author('John', 'editor')))
  kase('name case', () => eq(author('john', 'writer'), author('John', 'writer')))
  kase('same instance', () => {
    const it = author('a', 'b')
    return eq(it, it)
  })
  kase('other type', () => author('a', 'b').equals('Author(a, b)'))
  kase('null', () => author('a', 'b').equals(null))
  kase('in set', () => distinctSet([author('a', 'B'), author(' a', 'b '), author('b', 'a')]))
  kase('list contains', () => contains([author('a', 'b')], author('a ', 'B')))
})
func('hashCode', () => {
  kase('equal authors have equal hash', () => author(' John ', 'WRITER').hashCode() === author('John', 'writer').hashCode())
})
