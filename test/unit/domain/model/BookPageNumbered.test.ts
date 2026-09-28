// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/BookPageNumberedOracleTest.kt
import { BookPageNumbered } from '../../../../src/domain/model/BookPageNumbered.js'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/BookPageNumbered')

func('toString', () => {
  kase('defaults', () => new BookPageNumbered({ fileName: '001.jpg', mediaType: 'image/jpeg', pageNumber: 1 }).toString())
  kase('full', () =>
    new BookPageNumbered({ fileName: 'a b/ü.png', mediaType: 'image/png', dimension: new Dimension({ width: 800, height: 1200 }), fileHash: 'hash', fileSize: 123456789012, pageNumber: 42 }).toString(),
  )
  kase('quotes and empty', () => new BookPageNumbered({ fileName: '', mediaType: "'", fileHash: "'", pageNumber: -1 }).toString())
  kase('zero size', () => new BookPageNumbered({ fileName: 'x', mediaType: 'y', fileSize: 0, pageNumber: 2147483647 }).toString())
})
func('<init>', () => {
  kase('canonical', () => new BookPageNumbered({ fileName: '001.jpg', mediaType: 'image/jpeg', dimension: new Dimension({ width: 1, height: 2 }), fileHash: 'h', fileSize: 3, pageNumber: 4 }))
})
