// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/metadata/comicrack/dto/ReadingListTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { ReadingList } from '../../../../../src/infrastructure/metadata/comicrack/dto/ReadingList.js'
import { XmlMapper } from '../../../../../src/port/jackson-xml.js'

describe('ReadingListTest', () => {
  const mapper = new XmlMapper()

  it('given valid xml file when deserializing then properties are available', () => {
    // language=XML
    const cbl = `<?xml version="1.0"?>
<ReadingList>
  <Name>Civil War</Name>
  <Books>
    <Book Series="Civil War" Number="1" Volume="2006" Year="2006">
      <Id>1b21c8c4-e8d7-44f6-992d-97d24ce8123e</Id>
      <FileName>Civil War Vol.2006 #01 (July, 2006)</FileName>
    </Book>
    <Book Series="Wolverine" Number="42" Volume="2003" Year="2006">
      <Id>29a69cbf-af64-471d-889c-8fc0f0080f7c</Id>
      <FileName>Wolverine Vol.2003 #42 (July, 2006)</FileName>
    </Book>
    <Book Series="X-Factor" Number="HS" Volume="2006" Year="2006">
      <Id>ec70e585-5a80-428c-a67e-fd22b668449b</Id>
      <FileName>X-Factor Vol.2006 #08 (August, 2006)</FileName>
    </Book>
  </Books>
  <Matchers />
</ReadingList>`
    const readingList = mapper.readValue<ReadingList>(cbl, { class: ReadingList })

    expect(readingList.name).toBe('Civil War')
    expect(readingList.books).toHaveLength(3)

    expect(readingList.books[0]!.series).toBe('Civil War')
    expect(readingList.books[0]!.number).toBe('1')
    expect(readingList.books[0]!.volume).toBe(2006)
    expect(readingList.books[0]!.year).toBe(2006)
    expect(readingList.books[0]!.fileName).toBe('Civil War Vol.2006 #01 (July, 2006)')

    expect(readingList.books[1]!.series).toBe('Wolverine')
    expect(readingList.books[1]!.number).toBe('42')
    expect(readingList.books[1]!.volume).toBe(2003)
    expect(readingList.books[1]!.year).toBe(2006)
    expect(readingList.books[1]!.fileName).toBe('Wolverine Vol.2003 #42 (July, 2006)')

    expect(readingList.books[2]!.series).toBe('X-Factor')
    expect(readingList.books[2]!.number).toBe('HS')
    expect(readingList.books[2]!.volume).toBe(2006)
    expect(readingList.books[2]!.year).toBe(2006)
    expect(readingList.books[2]!.fileName).toBe('X-Factor Vol.2006 #08 (August, 2006)')
  })

  it('given valid xml file for smart list when deserializing then properties are available', () => {
    // language=XML
    const cbl = `<?xml version="1.0"?>
<ReadingList xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Name>Golden Age</Name>
  <Books />
  <Matchers>
    <ComicBookMatcher xsi:type="ComicBookSeriesMatcher" MatchOperator="4">
      <MatchValue>Marvel Masterworks</MatchValue>
    </ComicBookMatcher>
    <ComicBookMatcher xsi:type="ComicBookSeriesMatcher" MatchOperator="1">
      <MatchValue>Golden Age</MatchValue>
    </ComicBookMatcher>
  </Matchers>
</ReadingList>`
    const readingList = mapper.readValue<ReadingList>(cbl, { class: ReadingList })

    expect(readingList.name).toBe('Golden Age')
    expect(readingList.books).toHaveLength(0)
  })
})
