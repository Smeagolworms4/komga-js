// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/BookPageOracleTest.kt
import { BookPage, restoreHashFrom } from '../../../../src/domain/model/BookPage.js'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/BookPage')

const full = new BookPage({ fileName: '001.jpg', mediaType: 'image/jpeg', dimension: new Dimension({ width: 800, height: 1200 }), fileHash: 'abc', fileSize: 12345 })
const minimal = new BookPage({ fileName: '002.png', mediaType: 'image/png' })

func('<init>', () => {
  kase('defaults', () => minimal)
  kase('full', () => full)
})
func('toString', () => {
  kase('defaults', () => minimal.toString())
  kase('full', () => full.toString())
  kase('quotes', () => new BookPage({ fileName: "it's.jpg", mediaType: "image/'x'", fileHash: "h'" }).toString())
})
func('copy', () => {
  kase('no change', () => full.copy())
  kase('fileHash', () => full.copy({ fileHash: 'new' }))
  kase('all', () => full.copy({ fileName: 'a', mediaType: 'b', dimension: null, fileHash: '', fileSize: null }))
  kase('dimension', () => minimal.copy({ dimension: new Dimension({ width: 1, height: 2 }), fileSize: 0 }))
  kase('class', () => full.copy().constructor.name)
})
func('restoreHashFrom', () => {
  const a = new BookPage({ fileName: 'a.jpg', mediaType: 'image/jpeg', fileSize: 10 })
  const b = new BookPage({ fileName: 'b.jpg', mediaType: 'image/jpeg', fileSize: 20 })
  const c = new BookPage({ fileName: 'c.jpg', mediaType: 'image/png', fileSize: null })
  kase('empty', () => restoreHashFrom([], [a.copy({ fileHash: 'x' })]))
  kase('empty source', () => restoreHashFrom([a, b], []))
  kase('matching', () => restoreHashFrom([a, b, c], [b.copy({ fileHash: 'hb' }), a.copy({ fileHash: 'ha' }), c.copy({ fileHash: 'hc' })]))
  kase('blank hash ignored', () => restoreHashFrom([a], [a.copy({ fileHash: '  ' }), a.copy({ fileHash: '' })]))
  kase('first non blank wins', () => restoreHashFrom([a], [a.copy({ fileHash: ' ' }), a.copy({ fileHash: 'h1' }), a.copy({ fileHash: 'h2' })]))
  kase('different size', () => restoreHashFrom([a], [a.copy({ fileSize: 11, fileHash: 'x' })]))
  kase('null vs non null size', () => restoreHashFrom([a], [a.copy({ fileSize: null, fileHash: 'x' })]))
  kase('different media type', () => restoreHashFrom([a], [a.copy({ mediaType: 'image/png', fileHash: 'x' })]))
  kase('different name', () => restoreHashFrom([a], [a.copy({ fileName: 'A.jpg', fileHash: 'x' })]))
  kase('dimension ignored', () => restoreHashFrom([a.copy({ dimension: new Dimension({ width: 1, height: 1 }) })], [a.copy({ fileHash: 'x' })]))
  kase('existing hash replaced', () => restoreHashFrom([a.copy({ fileHash: 'old' })], [a.copy({ fileHash: 'new' })]))
  kase('existing hash kept', () => restoreHashFrom([a.copy({ fileHash: 'old' })], [b.copy({ fileHash: 'new' })]))
  kase('unicode blank', () => restoreHashFrom([a], [a.copy({ fileHash: '  ' })]))
  kase('same instance', () => restoreHashFrom([a], [b])[0] === a)
})
