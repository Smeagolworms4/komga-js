// Tests du support Kotlin (sans jumeau).
import { describe, expect, it } from 'vitest'
import { isBlank, trim } from '../../src/port/kotlin.js'

describe('kotlin', () => {
  it('trim and isBlank follow Char.isWhitespace, not JS whitespace', () => {
    expect(trim(' \u001Ca﻿　')).toBe('a﻿')
    expect(isBlank('\u001C ')).toBe(true)
    expect(isBlank('﻿')).toBe(false)
  })
})
