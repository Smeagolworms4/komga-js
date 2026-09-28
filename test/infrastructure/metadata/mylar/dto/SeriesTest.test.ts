// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/metadata/mylar/dto/SeriesTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, describe, expect, it } from 'vitest'
import { AgeRating } from '../../../../../src/infrastructure/metadata/mylar/dto/AgeRating.js'
import { Series } from '../../../../../src/infrastructure/metadata/mylar/dto/Series.js'
import { Status } from '../../../../../src/infrastructure/metadata/mylar/dto/Status.js'
import { MismatchedInputException, ObjectMapper } from '../../../../../src/port/jackson-mapper.js'
import { closeContext, springBootTest } from '../../../../SpringBootTest.js'

/** `catchThrowable { }` */
function catchThrowable(block: () => unknown): unknown {
  try {
    block()
  } catch (e) {
    return e
  }
  return null
}

// @SpringBootTest
describe('SeriesTest', () => {
  const ctx = springBootTest()
  afterAll(() => closeContext(ctx))
  const mapper = ctx.getBean(ObjectMapper)

  it('given valid json file when deserializing then properties are available', () => {
    // language=JSON
    const json = `{
  "version": "1.0.1",
  "metadata": {
    "type": "comicSeries",
    "publisher": "DC Comics",
    "imprint": null,
    "name": "American Vampire 1976",
    "cid": 130865,
    "year": 2020,
    "description_text": "Nine issue mini-series, the closing chapter of American Vampire",
    "description_formatted": "Nine issue mini-series, the closing chapter of American Vampire",
    "volume": null,
    "booktype": "Print",
    "age_rating": "Adult",
    "collects": null,
    "ComicImage": "https://comicvine.gamespot.com/a/uploads/scale_large/6/67663/7603293-01.jpg",
    "total_issues": 9,
    "publication_run": "December 2020 - Present",
    "status": "Continuing"
  }
}`
    const seriesJson = mapper.readValue<Series>(json, { class: Series })

    expect(seriesJson.metadata).not.toBeNull()
    expect(seriesJson.metadata.type).toBe('comicSeries')
    expect(seriesJson.metadata.publisher).toBe('DC Comics')
    expect(seriesJson.metadata.imprint).toBeNull()
    expect(seriesJson.metadata.name).toBe('American Vampire 1976')
    expect(seriesJson.metadata.comicid).toBe('130865')
    expect(seriesJson.metadata.year).toBe(2020)
    expect(seriesJson.metadata.descriptionText).toBe('Nine issue mini-series, the closing chapter of American Vampire')
    expect(seriesJson.metadata.descriptionFormatted).toBe('Nine issue mini-series, the closing chapter of American Vampire')
    expect(seriesJson.metadata.volume).toBeNull()
    expect(seriesJson.metadata.bookType).toBe('Print')
    expect(seriesJson.metadata.ageRating).toBe(AgeRating.ADULT)
    expect(seriesJson.metadata.comicImage).toBe('https://comicvine.gamespot.com/a/uploads/scale_large/6/67663/7603293-01.jpg')
    expect(seriesJson.metadata.totalIssues).toBe(9)
    expect(seriesJson.metadata.publicationRun).toBe('December 2020 - Present')
    expect(seriesJson.metadata.status).toBe(Status.Continuing)
  })

  it('given another valid json file when deserializing then properties are available', () => {
    // language=JSON
    const json = `{
  "version": "1.0.1",
  "metadata": {
    "type": "comicSeries",
    "publisher": "IDW Publishing",
    "imprint": null,
    "name": "Usagi Yojimbo",
    "comicid": 119731,
    "year": 2019,
    "description_text": null,
    "description_formatted": null,
    "volume": 4,
    "booktype": "Print",
    "age_rating": null,
    "collects": null,
    "comic_image": "https://comicvine1.cbsistatic.com/uploads/scale_large/6/67663/6974029-01a.jpg",
    "total_issues": 20,
    "publication_run": "June 2019 - Present",
    "status": "Ended"
  }
}`
    const seriesJson = mapper.readValue<Series>(json, { class: Series })

    expect(seriesJson.metadata).not.toBeNull()
    expect(seriesJson.metadata.type).toBe('comicSeries')
    expect(seriesJson.metadata.publisher).toBe('IDW Publishing')
    expect(seriesJson.metadata.imprint).toBeNull()
    expect(seriesJson.metadata.name).toBe('Usagi Yojimbo')
    expect(seriesJson.metadata.comicid).toBe('119731')
    expect(seriesJson.metadata.year).toBe(2019)
    expect(seriesJson.metadata.descriptionText).toBeNull()
    expect(seriesJson.metadata.descriptionFormatted).toBeNull()
    expect(seriesJson.metadata.volume).toBe(4)
    expect(seriesJson.metadata.bookType).toBe('Print')
    expect(seriesJson.metadata.ageRating).toBeNull()
    expect(seriesJson.metadata.comicImage).toBe('https://comicvine1.cbsistatic.com/uploads/scale_large/6/67663/6974029-01a.jpg')
    expect(seriesJson.metadata.totalIssues).toBe(20)
    expect(seriesJson.metadata.publicationRun).toBe('June 2019 - Present')
    expect(seriesJson.metadata.status).toBe(Status.Ended)
  })

  it('given yet another valid json file when deserializing then properties are available', () => {
    // language=JSON
    const json = `{
  "version": "1.0.1",
  "metadata": {
    "type": "comicSeries",
    "publisher": "Kodansha Comics USA",
    "imprint": null,
    "name": "Vinland Saga",
    "comicid": 69157,
    "year": 2013,
    "description_text": "English translation of Vinland Saga (ヴィンランド・サガ).Vinland Saga is the first series from Kodansha Comics USA to be released in hardcovers, each collection collects and translates two volumes of the original Japanese manga",
    "description_formatted": "English translation of Vinland Saga (ヴィンランド・サガ).Vinland Saga is the first series from Kodansha Comics USA to be released in hardcovers, each collection collects and translates two volumes of the original Japanese manga",
    "volume": null,
    "booktype": "Print",
    "age_rating": null,
    "collects": null,
    "ComicImage": "https://comicvine.gamespot.com/a/uploads/scale_large/6/67663/3439178-01.jpg",
    "total_issues": 12,
    "publication_run": "November 2013 - December 2021",
    "status": "Ended"
  }
}`
    const seriesJson = mapper.readValue<Series>(json, { class: Series })

    expect(seriesJson.metadata).not.toBeNull()
    expect(seriesJson.metadata.type).toBe('comicSeries')
    expect(seriesJson.metadata.publisher).toBe('Kodansha Comics USA')
    expect(seriesJson.metadata.imprint).toBeNull()
    expect(seriesJson.metadata.name).toBe('Vinland Saga')
    expect(seriesJson.metadata.comicid).toBe('69157')
    expect(seriesJson.metadata.year).toBe(2013)
    expect(seriesJson.metadata.descriptionText).toBe('English translation of Vinland Saga (ヴィンランド・サガ).Vinland Saga is the first series from Kodansha Comics USA to be released in hardcovers, each collection collects and translates two volumes of the original Japanese manga')
    expect(seriesJson.metadata.descriptionFormatted).toBe('English translation of Vinland Saga (ヴィンランド・サガ).Vinland Saga is the first series from Kodansha Comics USA to be released in hardcovers, each collection collects and translates two volumes of the original Japanese manga')
    expect(seriesJson.metadata.volume).toBeNull()
    expect(seriesJson.metadata.bookType).toBe('Print')
    expect(seriesJson.metadata.ageRating).toBeNull()
    expect(seriesJson.metadata.comicImage).toBe('https://comicvine.gamespot.com/a/uploads/scale_large/6/67663/3439178-01.jpg')
    expect(seriesJson.metadata.totalIssues).toBe(12)
    expect(seriesJson.metadata.publicationRun).toBe('November 2013 - December 2021')
    expect(seriesJson.metadata.status).toBe(Status.Ended)
  })

  it('given invalid json file missing year when deserializing then it fails', () => {
    // language=JSON
    const json = `{
  "version": "1.0.1",
  "metadata": {
    "type": "comicSeries",
    "publisher": "IDW Publishing",
    "imprint": null,
    "name": "Usagi Yojimbo",
    "comicid": 119731,
    "description_text": null,
    "description_formatted": null,
    "volume": 4,
    "booktype": "Print",
    "age_rating": null,
    "collects": null,
    "ComicImage": "https://comicvine1.cbsistatic.com/uploads/scale_large/6/67663/6974029-01a.jpg",
    "total_issues": 20,
    "publication_run": "June 2019 - Present",
    "status": "Ended"
  }
}`
    const thrown = catchThrowable(() => mapper.readValue<Series>(json, { class: Series }))

    expect(thrown).toBeInstanceOf(MismatchedInputException)
  })

  it('given invalid json file missing publisher when deserializing then it fails', () => {
    // language=JSON
    const json = `{
  "version": "1.0.1",
  "metadata": {
    "type": "comicSeries",
    "imprint": null,
    "name": "Usagi Yojimbo",
    "comicid": 119731,
    "year": 2019,
    "description_text": null,
    "description_formatted": null,
    "volume": 4,
    "booktype": "Print",
    "age_rating": null,
    "collects": null,
    "ComicImage": "https://comicvine1.cbsistatic.com/uploads/scale_large/6/67663/6974029-01a.jpg",
    "total_issues": 20,
    "publication_run": "June 2019 - Present",
    "status": "Ended"
  }
}`
    const thrown = catchThrowable(() => mapper.readValue<Series>(json, { class: Series }))

    expect(thrown).toBeInstanceOf(MismatchedInputException)
  })

  it('given invalid json file missing status when deserializing then it fails', () => {
    // language=JSON
    const json = `{
  "version": "1.0.1",
  "metadata": {
    "type": "comicSeries",
    "publisher": "IDW Publishing",
    "imprint": null,
    "name": "Usagi Yojimbo",
    "comicid": 119731,
    "year": 2019,
    "description_text": null,
    "description_formatted": null,
    "volume": 4,
    "booktype": "Print",
    "age_rating": null,
    "collects": null,
    "ComicImage": "https://comicvine1.cbsistatic.com/uploads/scale_large/6/67663/6974029-01a.jpg",
    "total_issues": 20,
    "publication_run": "June 2019 - Present"
  }
}`
    const thrown = catchThrowable(() => mapper.readValue<Series>(json, { class: Series }))

    expect(thrown).toBeInstanceOf(MismatchedInputException)
  })
})
