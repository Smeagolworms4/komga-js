// Support de portage : org.apache.commons.validator.routines.ISBNValidator (commons-validator 1.11.0),
// portage à plat des classes utilisées sur ce chemin : ISBNValidator, CodeValidator, RegexValidator,
// checkdigit.{ModulusCheckDigit, EAN13CheckDigit, ISBN10CheckDigit}, GenericValidator.isBlankOrNull.
// Ce fichier n'a pas de jumeau Kotlin.
// Équivalence vérifiée contre commons-validator-1.11.0.jar (jshell) : isValid / validate / convertToISBN13,
// voir test/port/commons-validator.test.ts.
import { Exception, IllegalArgumentException } from './kotlin.js'

/** `String.trim()` de Java : retire les caractères <= U+0020 aux extrémités */
function javaTrim(s: string): string {
  let st = 0
  let len = s.length
  while (st < len && s.charCodeAt(st) <= 0x20) st++
  while (st < len && s.charCodeAt(len - 1) <= 0x20) len--
  return st > 0 || len < s.length ? s.substring(st, len) : s
}

/** `GenericValidator.isBlankOrNull` */
function isBlankOrNull(value: string | null): boolean {
  return value === null || javaTrim(value).length === 0
}

export class CheckDigitException extends Exception {}

// ---------------------------------------------------------------------------
// checkdigit
// ---------------------------------------------------------------------------

function isAsciiDigit(c: number): boolean {
  return c >= 0 && c <= 9
}

export abstract class ModulusCheckDigit {
  static readonly MODULUS_10 = 10
  static readonly MODULUS_11 = 11

  private readonly modulus: number

  constructor(modulus: number = ModulusCheckDigit.MODULUS_10) {
    this.modulus = modulus
  }

  calculate(code: string | null): string {
    if (isBlankOrNull(code)) {
      throw new CheckDigitException('Code is missing')
    }
    const modulusResult = this.calculateModulus(code as string, false)
    const charValue = (this.modulus - modulusResult) % this.modulus
    return this.toCheckDigit(charValue)
  }

  protected calculateModulus(code: string, includesCheckDigit: boolean): number {
    let total = 0
    for (let i = 0; i < code.length; i++) {
      const lth = code.length + (includesCheckDigit ? 0 : 1)
      const leftPos = i + 1
      const rightPos = lth - i
      const charValue = this.toInt(code.charAt(i), leftPos, rightPos)
      total += this.weightedValue(charValue, leftPos, rightPos)
    }
    if (total === 0) {
      throw new CheckDigitException('Invalid code, sum is zero')
    }
    return total % this.modulus
  }

  getModulus(): number {
    return this.modulus
  }

  protected isLength(code: string | null, length: number): boolean {
    return code !== null && code.length === length
  }

  isValid(code: string | null): boolean {
    if (isBlankOrNull(code)) {
      return false
    }
    try {
      return this.calculateModulus(code as string, true) === 0
    } catch (ex) {
      if (ex instanceof CheckDigitException) return false
      throw ex
    }
  }

  protected toCheckDigit(charValue: number): string {
    if (isAsciiDigit(charValue)) {
      return String(charValue)
    }
    throw new CheckDigitException(`Invalid Check Digit Value =${charValue}`)
  }

  protected toInt(character: string, leftPos: number, rightPos: number): number {
    const c = character.charCodeAt(0) - 48
    if (isAsciiDigit(c)) {
      return c
    }
    throw new CheckDigitException(`Invalid Character[${leftPos},${rightPos}] = '${character}'`)
  }

  protected abstract weightedValue(charValue: number, leftPos: number, rightPos: number): number
}

export class EAN13CheckDigit extends ModulusCheckDigit {
  static readonly EAN13_CHECK_DIGIT = new EAN13CheckDigit()
  private static readonly POSITION_WEIGHT = [3, 1]
  private static readonly EAN13_LEN = 13

  override isValid(code: string | null): boolean {
    return this.isLength(code, EAN13CheckDigit.EAN13_LEN) && super.isValid(code)
  }

  protected weightedValue(charValue: number, leftPos: number, rightPos: number): number {
    return charValue * (EAN13CheckDigit.POSITION_WEIGHT[rightPos % 2] as number)
  }
}

export class ISBN10CheckDigit extends ModulusCheckDigit {
  static readonly ISBN10_CHECK_DIGIT = new ISBN10CheckDigit()
  private static readonly ISBN10_LEN = 10

  constructor() {
    super(ModulusCheckDigit.MODULUS_11)
  }

  override isValid(code: string | null): boolean {
    return this.isLength(code, ISBN10CheckDigit.ISBN10_LEN) && super.isValid(code)
  }

  protected override toCheckDigit(charValue: number): string {
    if (charValue === 10) {
      return 'X'
    }
    return super.toCheckDigit(charValue)
  }

  protected override toInt(character: string, leftPos: number, rightPos: number): number {
    if (rightPos === 1 && character === 'X') {
      return 10
    }
    return super.toInt(character, leftPos, rightPos)
  }

  protected weightedValue(charValue: number, leftPos: number, rightPos: number): number {
    return charValue * rightPos
  }
}

// ---------------------------------------------------------------------------
// RegexValidator / CodeValidator
// ---------------------------------------------------------------------------

export class RegexValidator {
  private readonly patterns: RegExp[]

  constructor(regex: string) {
    // PORT: java.util.regex -> RegExp ; les motifs utilisés n'emploient que \d (ASCII en Java) et \s (réécrit
    // en [ \t\n\x0B\f\r], sa définition Java). Matcher.matches() = correspondance de toute la chaîne.
    this.patterns = [new RegExp(`^(?:${regex.replaceAll('\\s', '[ \\t\\n\\x0B\\f\\r]')})$`)]
  }

  isValid(value: string | null): boolean {
    if (value === null) {
      return false
    }
    for (const pattern of this.patterns) {
      if (pattern.test(value)) {
        return true
      }
    }
    return false
  }

  validate(value: string | null): string | null {
    if (value === null) {
      return null
    }
    for (const pattern of this.patterns) {
      const matcher = pattern.exec(value)
      if (matcher !== null) {
        const count = matcher.length - 1
        if (count === 1) {
          const group = matcher[1]
          return group !== undefined ? group : ''
        }
        let buffer = ''
        for (let j = 0; j < count; j++) {
          const component = matcher[j + 1]
          if (component !== undefined) {
            buffer += component
          }
        }
        return buffer
      }
    }
    return null
  }
}

export class CodeValidator {
  private readonly regexValidator: RegexValidator | null
  private readonly minLength: number
  private readonly maxLength: number
  private readonly checkdigit: ModulusCheckDigit | null

  constructor(regex: string, length: number, checkdigit: ModulusCheckDigit | null) {
    this.regexValidator = isBlankOrNull(regex) ? null : new RegexValidator(regex)
    this.minLength = length
    this.maxLength = length
    this.checkdigit = checkdigit
  }

  getCheckDigit(): ModulusCheckDigit | null {
    return this.checkdigit
  }

  isValid(input: string | null): boolean {
    return this.validate(input) !== null
  }

  validate(input: string | null): string | null {
    if (input === null) {
      return null
    }
    let code: string | null = javaTrim(input)
    if (code.length === 0) {
      return null
    }
    // validate/reformat using regular expression
    if (this.regexValidator !== null) {
      code = this.regexValidator.validate(code)
      if (code === null) {
        return null
      }
    }
    // check the length (must be done after validate as that can change the code)
    if ((this.minLength >= 0 && code.length < this.minLength) || (this.maxLength >= 0 && code.length > this.maxLength)) {
      return null
    }
    // validate the check digit
    if (this.checkdigit !== null && !this.checkdigit.isValid(code)) {
      return null
    }
    return code
  }
}

// ---------------------------------------------------------------------------
// ISBNValidator
// ---------------------------------------------------------------------------

const ISBN_10_LEN = 10
const SEP = '(?:\\-|\\s)'
const GROUP = '(\\d{1,5})'
const PUBLISHER = '(\\d{1,7})'
const TITLE = '(\\d{1,6})'
const ISBN10_REGEX = '^(?:(\\d{9}[0-9X])|(?:' + GROUP + SEP + PUBLISHER + SEP + TITLE + SEP + '([0-9X])))$'
const ISBN13_REGEX = '^(978|979)(?:(\\d{10})|(?:' + SEP + GROUP + SEP + PUBLISHER + SEP + TITLE + SEP + '([0-9])))$'

export class ISBNValidator {
  private readonly isbn10Validator = new CodeValidator(ISBN10_REGEX, 10, ISBN10CheckDigit.ISBN10_CHECK_DIGIT)
  private readonly isbn13Validator = new CodeValidator(ISBN13_REGEX, 13, EAN13CheckDigit.EAN13_CHECK_DIGIT)
  private readonly convert: boolean

  constructor(convert: boolean = true) {
    this.convert = convert
  }

  convertToISBN13(isbn10: string | null): string | null {
    if (isbn10 === null) {
      return null
    }
    const input = javaTrim(isbn10)
    if (input.length !== ISBN_10_LEN) {
      throw new IllegalArgumentException(`Invalid length ${input.length} for '${input}'`)
    }
    // Calculate the new ISBN-13 code (drop the original checkdigit)
    let isbn13 = '978' + input.substring(0, ISBN_10_LEN - 1)
    try {
      const checkDigit = (this.isbn13Validator.getCheckDigit() as ModulusCheckDigit).calculate(isbn13)
      isbn13 += checkDigit
      return isbn13
    } catch (e) {
      if (e instanceof CheckDigitException) throw new IllegalArgumentException(`Check digit error for '${input}' - ${e.message}`)
      throw e
    }
  }

  isValid(code: string | null): boolean {
    return this.isValidISBN13(code) || this.isValidISBN10(code)
  }

  isValidISBN10(code: string | null): boolean {
    return this.isbn10Validator.isValid(code)
  }

  isValidISBN13(code: string | null): boolean {
    return this.isbn13Validator.isValid(code)
  }

  validate(code: string | null): string | null {
    let result = this.validateISBN13(code)
    if (result === null) {
      result = this.validateISBN10(code)
      if (result !== null && this.convert) {
        result = this.convertToISBN13(result)
      }
    }
    return result
  }

  validateISBN10(code: string | null): string | null {
    return this.isbn10Validator.validate(code)
  }

  validateISBN13(code: string | null): string | null {
    return this.isbn13Validator.validate(code)
  }
}
