// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/metadata/comicrack/dto/ComicInfoTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { AgeRating } from '../../../../../src/infrastructure/metadata/comicrack/dto/AgeRating.js'
import { ComicInfo } from '../../../../../src/infrastructure/metadata/comicrack/dto/ComicInfo.js'
import { Manga } from '../../../../../src/infrastructure/metadata/comicrack/dto/Manga.js'
import { YesNo } from '../../../../../src/infrastructure/metadata/comicrack/dto/YesNo.js'
import { XmlMapper } from '../../../../../src/port/jackson-xml.js'

describe('ComicInfoTest', () => {
  const mapper = new XmlMapper()

  it('given valid xml file when deserializing then properties are available', () => {
    // language=XML
    const xml = `<?xml version="1.0"?>
<ComicInfo>
  <Title>v01 - Preludes &amp; Nocturnes - 30th Anniversary Edition</Title>
  <Series>Sandman</Series>
  <Web>https://www.comixology.com/Sandman/digital-comic/727888</Web>
  <Summary>Neil Gaiman's seminal series, THE SANDMAN, celebrates its 30th anniversary with an all-new edition of THE
      SANDMAN VOL. 1: PRELUDES &amp; NOCTURNES!

       New York Times best-selling author Neil Gaiman's transcendent series THE SANDMAN is often hailed as the
      definitive Vertigo title and one of the finest achievements in graphic storytelling. Gaiman created an
      unforgettable tale of the forces that exist beyond life and death by weaving ancient mythology, folklore and
      fairy tales with his own distinct narrative vision.

       In PRELUDES &amp; NOCTURNES, an occultist attempting to capture Death to bargain for eternal life traps her
      younger brother Dream instead. After his 70 year imprisonment and eventual escape, Dream, also known as
      Morpheus, goes on a quest for his lost objects of power. On his arduous journey Morpheus encounters Lucifer,
      John Constantine, and an all-powerful madman.

       This book also includes the story "The Sound of Her Wings," which introduces us to the pragmatic and perky goth
      girl Death.

       Collects THE SANDMAN #1-8.</Summary>
  <Notes>Scraped metadata from Comixology [CMXDB727888], [RELDATE:2018-10-30]</Notes>
  <Translator>The translator</Translator>
  <Publisher>DC</Publisher>
  <Imprint>Vertigo</Imprint>
  <Count>10</Count>
  <Genre>Fantasy, Supernatural/Occult, Horror, Mature, Superhero, Mythology, Drama</Genre>
  <Tags>dark, Occult</Tags>
  <PageCount>237</PageCount>
  <LanguageISO>en</LanguageISO>
  <AgeRating>Mature 17+</AgeRating>
  <BlackAndWhite>No</BlackAndWhite>
  <Manga>No</Manga>
  <SeriesGroup>Sandman</SeriesGroup>
  <GTIN>ABC123</GTIN>
  <ScanInformation></ScanInformation>
</ComicInfo>`
    const comicInfo = mapper.readValue<ComicInfo>(xml, { class: ComicInfo })

    expect(comicInfo.title).toBe('v01 - Preludes & Nocturnes - 30th Anniversary Edition')
    expect(comicInfo.series).toBe('Sandman')
    expect(comicInfo.web).toBe('https://www.comixology.com/Sandman/digital-comic/727888')
    expect(comicInfo.summary?.startsWith("Neil Gaiman's seminal series")).toBe(true)
    expect(comicInfo.notes).toBe('Scraped metadata from Comixology [CMXDB727888], [RELDATE:2018-10-30]')
    expect(comicInfo.publisher).toBe('DC')
    expect(comicInfo.imprint).toBe('Vertigo')
    expect(comicInfo.count).toBe(10)
    expect(comicInfo.genre).toBe('Fantasy, Supernatural/Occult, Horror, Mature, Superhero, Mythology, Drama')
    expect(comicInfo.tags).toBe('dark, Occult')
    expect(comicInfo.pageCount).toBe(237)
    expect(comicInfo.languageISO).toBe('en')
    expect(comicInfo.scanInformation).toBe('')
    expect(comicInfo.ageRating).toBe(AgeRating.MATURE_17)
    expect(comicInfo.blackAndWhite).toBe(YesNo.NO)
    expect(comicInfo.manga).toBe(Manga.NO)
    expect(comicInfo.seriesGroup).toBe('Sandman')
    expect(comicInfo.translator).toBe('The translator')
    expect(comicInfo.gtin).toBe('ABC123')
  })

  it('given another valid xml file when deserializing then properties are available', () => {
    // language=XML
    const xml = `<?xml version="1.0"?>
<ComicInfo>
    <Title>v01 - Preludes &amp; Nocturnes - 30th Anniversary Edition</Title>
    <Series>Sandman</Series>
    <Web>https://www.comixology.com/Sandman/digital-comic/727888</Web>
    <Summary>Neil Gaiman's seminal series, THE SANDMAN, celebrates its 30th anniversary with an all-new edition of THE
        SANDMAN VOL. 1: PRELUDES &amp; NOCTURNES!

         New York Times best-selling author Neil Gaiman's transcendent series THE SANDMAN is often hailed as the
        definitive Vertigo title and one of the finest achievements in graphic storytelling. Gaiman created an
        unforgettable tale of the forces that exist beyond life and death by weaving ancient mythology, folklore and
        fairy tales with his own distinct narrative vision.

         In PRELUDES &amp; NOCTURNES, an occultist attempting to capture Death to bargain for eternal life traps her
        younger brother Dream instead. After his 70 year imprisonment and eventual escape, Dream, also known as
        Morpheus, goes on a quest for his lost objects of power. On his arduous journey Morpheus encounters Lucifer,
        John Constantine, and an all-powerful madman.

         This book also includes the story "The Sound of Her Wings," which introduces us to the pragmatic and perky goth
        girl Death.

         Collects THE SANDMAN #1-8.
    </Summary>
    <Notes>Scraped metadata from Comixology [CMXDB727888], [RELDATE:2018-10-30]</Notes>
    <Publisher>DC</Publisher>
    <Imprint>Vertigo</Imprint>
    <Genre>Fantasy, Supernatural/Occult, Horror, Mature, Superhero, Mythology, Drama</Genre>
    <PageCount>237</PageCount>
    <LanguageISO>en</LanguageISO>
    <AgeRating>MA15+</AgeRating>
    <BlackAndWhite>No</BlackAndWhite>
    <Year>2018</Year>
    <Month>10</Month>
    <Day>30</Day>
    <Manga>No</Manga>
    <SeriesGroup>Sandman</SeriesGroup>
    <ScanInformation></ScanInformation>
</ComicInfo>`
    const comicInfo = mapper.readValue<ComicInfo>(xml, { class: ComicInfo })

    expect(comicInfo.title).toBe('v01 - Preludes & Nocturnes - 30th Anniversary Edition')
    expect(comicInfo.series).toBe('Sandman')
    expect(comicInfo.web).toBe('https://www.comixology.com/Sandman/digital-comic/727888')
    expect(comicInfo.summary?.startsWith("Neil Gaiman's seminal series")).toBe(true)
    expect(comicInfo.notes).toBe('Scraped metadata from Comixology [CMXDB727888], [RELDATE:2018-10-30]')
    expect(comicInfo.publisher).toBe('DC')
    expect(comicInfo.imprint).toBe('Vertigo')
    expect(comicInfo.count).toBeNull()
    expect(comicInfo.genre).toBe('Fantasy, Supernatural/Occult, Horror, Mature, Superhero, Mythology, Drama')
    expect(comicInfo.pageCount).toBe(237)
    expect(comicInfo.languageISO).toBe('en')
    expect(comicInfo.scanInformation).toBe('')
    expect(comicInfo.ageRating).toBe(AgeRating.MA_15)
    expect(comicInfo.blackAndWhite).toBe(YesNo.NO)
    expect(comicInfo.manga).toBe(Manga.NO)
    expect(comicInfo.seriesGroup).toBe('Sandman')
    expect(comicInfo.year).toBe(2018)
    expect(comicInfo.month).toBe(10)
    expect(comicInfo.day).toBe(30)
  })

  it('given incorrect enum values when deserializing then it is ignored', () => {
    // language=XML
    const xml = `<?xml version="1.0"?>
<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <AgeRating>Non existent</AgeRating>
  <BlackAndWhite>Non existent</BlackAndWhite>
  <Manga>Non existent</Manga>
</ComicInfo>`
    const comicInfo = mapper.readValue<ComicInfo>(xml, { class: ComicInfo })

    expect(comicInfo.ageRating).toBeNull()
    expect(comicInfo.blackAndWhite).toBeNull()
    expect(comicInfo.manga).toBeNull()
  })

  it('given valid xml file with StoryArc fields when deserializing then properties are available', () => {
    // language=XML
    const xml = `<?xml version="1.0"?>
<ComicInfo>
    <StoryArc>Arc</StoryArc>
    <StoryArcNumber>2</StoryArcNumber>
</ComicInfo>`
    const comicInfo = mapper.readValue<ComicInfo>(xml, { class: ComicInfo })

    expect(comicInfo.storyArc).toBe('Arc')
    expect(comicInfo.storyArcNumber).toBe('2')
  })
})
