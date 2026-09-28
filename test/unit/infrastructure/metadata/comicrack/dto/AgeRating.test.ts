// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/metadata/comicrack/dto/AgeRatingOracleTest.kt
import { AgeRating } from '../../../../../../src/infrastructure/metadata/comicrack/dto/AgeRating.js'
import { oracle } from '../../../../oracle.js'

const { func, kase } = oracle('infrastructure/metadata/comicrack/dto/AgeRating')

// prettier-ignore
const values = [
  ...AgeRating.entries().map((it) => it.value),
  '', ' ', 'unknown', 'UNKNOWN', 'adults only 18+', 'AdultsOnly18+', '  Adults  Only 18+  ', 'Adults\tOnly 18+', 'Everyone 10 +', 'everyone10+',
  'MA15+', 'ma 15+', 'Mature17+', 'r 18+', 'Teen ', 'teen', 'TEEN', 'Kids to adults', 'PG-13', 'M ', 'g', '18+', 'İ',
  'ratingpending', 'earlychildhood', 'Everyone ', 'Ｔｅｅｎ',
]

func('fromValue', () => {
  for (const v of values) {
    kase(`'${v}'`, () => {
      const it = AgeRating.fromValue(v)
      return it !== null ? [it, it.value, it.ageRating] : null
    })
  }
})

// privée : appelée par fromValue
func('toLowerNoSpace', () => {
  for (const v of ['A B C', 'ÀÉÎ Õ Ü', 'İstanbul', 'ẞ', '  ', 'Σ Σ']) kase(`'${v}'`, () => AgeRating.fromValue(v))
})
