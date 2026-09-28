// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/metadata/comicrack/dto/BookOracleTest.kt
import { Book } from '../../../../../../src/infrastructure/metadata/comicrack/dto/Book.js'
import { oracle } from '../../../../oracle.js'

const { func, kase } = oracle('infrastructure/metadata/comicrack/dto/Book')

function book(series: string | null, number: string | null, volume: number | null, year: number | null, fileName: string | null): Book {
  const it = new Book()
  it.series = series
  it.number = number
  it.volume = volume
  it.year = year
  it.fileName = fileName
  return it
}

func('toString', () => {
  kase('empty', () => new Book().toString())
  kase('full', () => book('Batman', '12', 2016, 2020, 'Batman 012.cbz').toString())
  kase('blank strings', () => book('', ' ', 0, -1, '').toString())
  kase('special characters', () => book('Été, "quoted" (x)', '1.5', 2147483647, -2147483648, 'a\nb').toString())
  kase('null string values', () => book('null', 'null', null, null, 'null').toString())
})
