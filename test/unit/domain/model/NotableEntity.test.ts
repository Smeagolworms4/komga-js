// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/NotableEntityOracleTest.kt
import { NotableEntity } from '../../../../src/domain/model/NotableEntity.js'
import { contains, distinctSet, eq } from '../../../../src/port/kotlin.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/NotableEntity')

const entities = new Map<string, [string, string]>([
  ['plain', ['team', 'X-Men']],
  ['trimmed', ['  TEAM \t', '  X-Men \n']],
  ['unicode spaces', ['　Location\u001C', ' Gōtham ']],
  ['empty', ['', '']],
  ['blank', ['   ', '   ']],
  ['special lowercase', ['İLLUSTRATOR ΣΑΣ', 'İsmail']],
  ['bom not trimmed', ['﻿Kind', '﻿Name']],
])
const entity = (kind: string, name: string) => new NotableEntity({ kind, name })

func('<init>', () => {
  for (const [n, [kind, name]] of entities) kase(n, () => entity(kind, name))
})
func('toString', () => {
  for (const [n, [kind, name]] of entities) kase(n, () => entity(kind, name).toString())
})
func('equals', () => {
  kase('same values', () => eq(entity('team', 'X-Men'), entity('team', 'X-Men')))
  kase('normalized values', () => eq(entity('TEAM ', ' X-Men'), entity('team', 'X-Men')))
  kase('different name', () => eq(entity('team', 'X-Men'), entity('team', 'Avengers')))
  kase('different kind', () => eq(entity('team', 'X-Men'), entity('location', 'X-Men')))
  kase('name case', () => eq(entity('team', 'x-men'), entity('team', 'X-Men')))
  kase('same instance', () => {
    const it = entity('a', 'b')
    return eq(it, it)
  })
  kase('other type', () => entity('a', 'b').equals('NotableEntity(a, b)'))
  kase('null', () => entity('a', 'b').equals(null))
  kase('in set', () => distinctSet([entity('A', 'b'), entity(' a', 'b '), entity('b', 'a')]))
  kase('list contains', () => contains([entity('a', 'b')], entity('A ', 'b')))
})
func('hashCode', () => {
  kase('equal entities have equal hash', () => entity(' TEAM ', 'X-Men').hashCode() === entity('team', 'X-Men').hashCode())
  kase('value', () => entity('team', 'X-Men').hashCode())
})
