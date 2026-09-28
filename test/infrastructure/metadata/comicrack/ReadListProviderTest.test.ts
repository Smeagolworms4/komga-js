// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/metadata/comicrack/ReadListProviderTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it, vi } from 'vitest'
import { ComicRackListException } from '../../../../src/domain/model/Exceptions.js'
import { ReadListProvider } from '../../../../src/infrastructure/metadata/comicrack/ReadListProvider.js'
import { Book } from '../../../../src/infrastructure/metadata/comicrack/dto/Book.js'
import { ReadingList } from '../../../../src/infrastructure/metadata/comicrack/dto/ReadingList.js'

/** `ReadingList().apply { ... }` / `Book().apply { ... }` */
function readingList(values: Partial<ReadingList>): ReadingList {
  return Object.assign(new ReadingList(), values)
}

function book(values: Partial<Book>): Book {
  return Object.assign(new Book(), values)
}

/** `catchThrowable { }` */
function catchThrowable(block: () => unknown): unknown {
  try {
    block()
  } catch (e) {
    return e
  }
  return null
}

describe('ReadListProviderTest', () => {
  const mockMapper = { readValue: vi.fn() }
  const readListProvider = new ReadListProvider(mockMapper as never)

  describe('ImportFromCbl', () => {
    it('given CBL list with books when getting ReadListRequest then it is valid', () => {
      // given
      const cbl = readingList({
        name: 'my read list',
        books: [
          book({
            series: 'series 1',
            number: ' 4 ',
            volume: 2005,
          }),
          book({
            series: 'series 2',
            number: '1',
          }),
        ],
      })

      mockMapper.readValue.mockReturnValue(cbl)

      // when
      const request = readListProvider.importFromCbl(new Uint8Array(0))

      // then
      expect(request.name).toBe(cbl.name)
      expect(request.books).toHaveLength(2)

      expect([...request.books[0]!.series].sort()).toEqual(['series 1 (2005)', 'series 1'].sort())
      expect(request.books[0]!.number).toBe('4')

      expect([...request.books[1]!.series].sort()).toEqual(['series 2'])
      expect(request.books[1]!.number).toBe('1')
    })

    it('given CBL list with invalid books when getting ReadListRequest then exception is thrown', () => {
      // given
      const cbl = readingList({
        name: 'my read list',
        books: [
          book({
            series: ' ',
            number: '4',
            volume: 2005,
          }),
          book({
            series: null,
            number: '1',
          }),
          book({
            series: 'Series',
            number: null,
          }),
        ],
      })

      mockMapper.readValue.mockReturnValue(cbl)

      // when
      const thrown = catchThrowable(() => readListProvider.importFromCbl(new Uint8Array(0)))

      // then
      expect(thrown).toBeInstanceOf(ComicRackListException)
      expect(thrown).toHaveProperty('code', 'ERR_1031')
    })

    it('given CBL list without books when getting ReadListRequest then exception is thrown', () => {
      // given
      const cbl = readingList({
        name: 'my read list',
        books: [],
      })

      mockMapper.readValue.mockReturnValue(cbl)

      // when
      const thrown = catchThrowable(() => readListProvider.importFromCbl(new Uint8Array(0)))

      // then
      expect(thrown).toBeInstanceOf(ComicRackListException)
      expect(thrown).toHaveProperty('code', 'ERR_1029')
    })

    it('given CBL list without name when getting ReadListRequest then exception is thrown', () => {
      // given
      const cbl = readingList({
        name: null,
        books: [
          book({
            series: 'series 1',
            number: '4',
            volume: 2005,
          }),
          book({
            series: 'series 2',
            number: '1',
          }),
        ],
      })

      mockMapper.readValue.mockReturnValue(cbl)

      // when
      const thrown = catchThrowable(() => readListProvider.importFromCbl(new Uint8Array(0)))

      // then
      expect(thrown).toBeInstanceOf(ComicRackListException)
      expect(thrown).toHaveProperty('code', 'ERR_1030')
    })

    it('given CBL list with blank name when getting ReadListRequest then exception is thrown', () => {
      // given
      const cbl = readingList({
        name: '  ',
        books: [
          book({
            series: 'series 1',
            number: '4',
            volume: 2005,
          }),
          book({
            series: 'series 2',
            number: '1',
          }),
        ],
      })

      mockMapper.readValue.mockReturnValue(cbl)

      // when
      const thrown = catchThrowable(() => readListProvider.importFromCbl(new Uint8Array(0)))

      // then
      expect(thrown).toBeInstanceOf(ComicRackListException)
      expect(thrown).toHaveProperty('code', 'ERR_1030')
    })
  })
})
