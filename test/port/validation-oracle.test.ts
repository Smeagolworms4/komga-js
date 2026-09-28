// Vérification des contraintes composées de infrastructure/validation contre Hibernate Validator 8.0.3 (Komga, jshell) :
// validator.validateValue(BookMetadataUpdateDto::class.java, "title" | "isbn", v),
// validateValue(SeriesMetadataUpdateDto::class.java, "language", v), validateValue(CollectionUpdateDto::class.java, "seriesIds", v).
// Colonnes : valeur, nb de violations NullOrNotBlank, NullOrBlankOrISBN, NullOrBlankOrBCP47.
import { describe, expect, it } from 'vitest'
import { NullOrBlankOrBCP47 } from '../../src/infrastructure/validation/NullOrBlankOrBCP47.js'
import { NullOrBlankOrISBN } from '../../src/infrastructure/validation/NullOrBlankOrISBN.js'
import { NullOrNotBlank } from '../../src/infrastructure/validation/NullOrNotBlank.js'
import { NullOrNotEmpty } from '../../src/infrastructure/validation/NullOrNotEmpty.js'
import { constraintViolations } from '../../src/port/validation.js'

const cases: [string | null, number, number, number][] = [
  [null, 0, 0, 0],
  ['', 2, 0, 0],
  [' ', 2, 0, 0],
  ['\t\n', 2, 0, 0],
  [' ', 0, 0, 0],
  [' ', 0, 0, 0],
  ['\u001c', 2, 0, 0],
  ['a', 0, 3, 3],
  [' a ', 0, 3, 3],
  ['9780306406157', 0, 0, 3],
  ['978-0-306-40615-7', 0, 0, 3],
  ['9780306406158', 0, 3, 3],
  ['0306406152', 0, 3, 3],
  ['978030640615X', 0, 3, 3],
  ['97803064061570', 0, 3, 3],
  ['x9780306406157y', 0, 0, 3],
  ['979-10-90636-07-1', 0, 0, 3],
  ['en', 0, 3, 0],
  ['EN', 0, 3, 0],
  ['en-US', 0, 3, 0],
  ['fr-CA', 0, 3, 0],
  ['zz', 0, 3, 3],
  ['xx-YY', 0, 3, 3],
  ['und', 0, 3, 3],
  ['i-klingon', 0, 3, 0],
  ['english', 0, 3, 3],
  ['e', 0, 3, 3],
  ['123', 0, 3, 3],
  ['ja-Jpan', 0, 3, 0],
  ['zh-Hant-TW', 0, 3, 0],
]

describe('validation oracle', () => {
  it('composed constraints report the same violations as Hibernate Validator', () => {
    for (const [v, notBlank, isbn, bcp47] of cases) {
      expect(constraintViolations(v, NullOrNotBlank()).length, `NullOrNotBlank ${JSON.stringify(v)}`).toBe(notBlank)
      expect(constraintViolations(v, NullOrBlankOrISBN()).length, `NullOrBlankOrISBN ${JSON.stringify(v)}`).toBe(isbn)
      expect(constraintViolations(v, NullOrBlankOrBCP47()).length, `NullOrBlankOrBCP47 ${JSON.stringify(v)}`).toBe(bcp47)
    }
  })

  it('violations are the composing constraints', () => {
    expect(constraintViolations('', NullOrNotBlank()).map((c) => c.type).sort()).toEqual(['NotBlank', 'Null'])
    expect(constraintViolations('a', NullOrBlankOrISBN()).map((c) => c.type).sort()).toEqual(['Blank', 'ISBN', 'Null'])
    expect(constraintViolations('zz', NullOrBlankOrBCP47()).map((c) => [c.type, c.message]).sort()).toEqual([
      ['BCP47', 'Must be a valid BCP 47 language tag'],
      ['Blank', 'Must be blank'],
      ['Null', '{jakarta.validation.constraints.Null.message}'],
    ])
  })

  it('NullOrNotEmpty on lists', () => {
    expect(constraintViolations([], NullOrNotEmpty()).map((c) => c.type).sort()).toEqual(['NotEmpty', 'Null'])
    expect(constraintViolations(['a'], NullOrNotEmpty())).toEqual([])
    expect(constraintViolations([''], NullOrNotEmpty())).toEqual([])
    expect(constraintViolations(null, NullOrNotEmpty())).toEqual([])
  })
})
