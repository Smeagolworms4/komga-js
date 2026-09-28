// ISBNValidator(true) de commons-validator 1.11.0 : résultats relevés sur la vraie classe (jshell, tools/jshell-komga.sh)
// pour ~430 entrées (ISBN-10/13 valides, avec séparateurs, espaces, casse du X, sommes nulles, chiffres non ASCII...).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ISBNValidator } from '../../src/port/commons-validator.js'

const oracle = JSON.parse(readFileSync(new URL('./fixtures/commons-validator-isbn.json', import.meta.url), 'utf8')) as {
  in: string
  isValid: boolean
  validate: string | null
}[]

describe('commons-validator', () => {
  it('ISBNValidator(true).isValid / validate match commons-validator 1.11.0', () => {
    const v = new ISBNValidator(true)
    const mismatches = oracle.filter((o) => {
      let r: string | null
      try {
        r = v.validate(o.in)
      } catch (e) {
        r = `EXC:${(e as Error).constructor.name}`
      }
      return v.isValid(o.in) !== o.isValid || r !== o.validate
    })
    expect(mismatches).toEqual([])
    expect(oracle.length).toBeGreaterThan(400)
  })
})
