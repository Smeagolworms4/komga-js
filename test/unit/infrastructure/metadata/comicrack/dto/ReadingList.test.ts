// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/metadata/comicrack/dto/ReadingListOracleTest.kt
import { Book } from '../../../../../../src/infrastructure/metadata/comicrack/dto/Book.js'
import { ReadingList } from '../../../../../../src/infrastructure/metadata/comicrack/dto/ReadingList.js'
import { oracle } from '../../../../oracle.js'

const { func, kase } = oracle('infrastructure/metadata/comicrack/dto/ReadingList')

function list(block: (it: ReadingList) => void): ReadingList {
  const it = new ReadingList()
  block(it)
  return it
}

func('toString', () => {
  kase('empty', () => new ReadingList().toString())
  kase('name only', () => list((it) => (it.name = 'My list')).toString())
  kase('blank name', () => list((it) => (it.name = '')).toString())
  kase('books', () =>
    list((it) => {
      it.name = 'L'
      const a = new Book()
      a.series = 'A'
      const b = new Book()
      b.series = 'B'
      b.number = '2'
      b.volume = 3
      b.year = 2000
      b.fileName = 'f'
      it.books = [a, b]
    }).toString(),
  )
  kase('one empty book', () => list((it) => (it.books = [new Book()])).toString())
})
