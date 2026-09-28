// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/metadata/epub/EpubMetadataProviderTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { readFileSync } from 'node:fs'
import { LocalDate } from '@js-joda/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

// PORT: mockkStatic(::getPackageFileContent) -> vi.mock du module, avec délégation à la vraie fonction hors mock
const mocks = vi.hoisted(() => ({ getPackageFileContent: null as ((path: string) => string | null) | null }))
vi.mock('../../../../src/infrastructure/mediacontainer/epub/Epub.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/infrastructure/mediacontainer/epub/Epub.js')>()
  return {
    ...actual,
    getPackageFileContent: (path: string) => (mocks.getPackageFileContent !== null ? mocks.getPackageFileContent(path) : actual.getPackageFileContent(path)),
  }
})

const { Author } = await import('../../../../src/domain/model/Author.js')
const { BookWithMedia } = await import('../../../../src/domain/model/BookWithMedia.js')
const { Media } = await import('../../../../src/domain/model/Media.js')
const { SeriesMetadata } = await import('../../../../src/domain/model/SeriesMetadata.js')
const { EpubMetadataProvider } = await import('../../../../src/infrastructure/metadata/epub/EpubMetadataProvider.js')
const { ISBNValidator } = await import('../../../../src/port/commons-validator.js')
const { pathToUrl } = await import('../../../../src/port/java-net.js')
const { makeBook } = await import('../../../domain/model/Utils.js')

/** `ClassPathResource(path).file.readText()` */
function classPathResourceText(path: string): string {
  return readFileSync(`test/resources/${path}`, 'utf8')
}

/** `assertThat(actual).containsExactlyInAnyOrder(...expected)` */
function expectExactlyInAnyOrder<T>(actual: Iterable<T> | null | undefined, ...expected: T[]): void {
  const a = [...(actual ?? [])]
  expect(a).toHaveLength(expected.length)
  expect(a).toEqual(expect.arrayContaining(expected as unknown[]))
}

describe('EpubMetadataProviderTest', () => {
  const isbnValidator = new ISBNValidator(true)
  const epubMetadataProvider = new EpubMetadataProvider(isbnValidator)

  const epubMetadataProviderProper = new EpubMetadataProvider(new ISBNValidator(true))

  const book = makeBook('book')
  const media = new Media({
    status: Media.Status.READY,
    mediaType: 'application/epub+zip',
  })

  afterEach(() => {
    mocks.getPackageFileContent = null
  })

  describe('Book', () => {
    it.each(['epub/Panik im Paradies.opf', 'epub/Panik im Paradies - namespace.opf'])(
      'given epub 3 opf when getting book metadata then metadata patch is valid',
      (opfFile) => {
        const opf = classPathResourceText(opfFile)
        mocks.getPackageFileContent = () => opf

        const patch = epubMetadataProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

        expect(patch.title).toBe('Panik im Paradies')
        expect(patch.summary).toBe(
          'Bereits im ersten Band "Panik im Paradies" machen die drei berühmten Detektive ihrem Namen alle Ehre. Eigentlich haben sie ja gerade Ferien. Doch dann treffen sie auf diesen schrulligen Kapitän Larsson, der sich einen kleinen Privatzoo mit exotischen Tieren hält. Als plötzlich alle Tiere an rätselhaften Infektionen erkranken und die Besucher ausbleiben, werden Justus, Peter und Bob neugierig. Schon bald merken sie, daß da jemand ein düsteres Geheimnis hütet...',
        )
        expect(patch.releaseDate).toEqual(LocalDate.of(1999, 7, 31))
        expectExactlyInAnyOrder(patch.authors, new Author({ name: 'Ulf Blanck', role: 'writer' }), new Author({ name: 'The Editor', role: 'editor' }))
        expect(patch.isbn).toBe('9783440077894')
        expect(patch.number).toBe('1.5')
        expect(patch.numberSort).toBe(1.5)
      },
    )

    it('given another epub 3 opf when getting book metadata then metadata patch is valid', () => {
      const opf = classPathResourceText('epub/Die Drei 3.opf')
      mocks.getPackageFileContent = () => opf

      const patch = epubMetadataProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expect(patch.title).toBe('Die Drei Fragezeichen-Kids, Bd.3, Invasion Der Fliegen')
      expect(patch.summary).toBe(
        'Hunderte von Fliegen tummeln sich auf dem Schrottplatz vor Tante Mathildas Haus. Das ist ein Alptraum! Findet diese "Invasion der Fliegen" tatsächlich statt oder leidet Tante Mathilda etwa an Halluzinationen? Justus, Peter und Bob nehmen sich der Sache an und kommen schnell dahinter, daß es sich hier nicht um eine Einbildung von Tante Mathilda handelt. Sie verfolgen die Spur der Fliegen bis in einen düsteren Kanalschacht...',
      )
      expect(patch.releaseDate).toEqual(LocalDate.of(1999, 7, 31))
      expectExactlyInAnyOrder(patch.authors, new Author({ name: 'Ulf Blanck', role: 'writer' }), new Author({ name: 'Stefanie Wegner', role: 'writer' }))
      expect(patch.isbn).toBe('9783440077931')
      expect(patch.number).toBe('3')
      expect(patch.numberSort).toBe(3)
    })

    it('given real epub 3 when getting book metadata then metadata patch is valid', () => {
      const epubBook = new BookWithMedia({
        book: makeBook('Epub', { url: pathToUrl('test/resources/epub/The Incomplete Theft - Ralph Burke.epub') }),
        media: media,
      })

      const patch = epubMetadataProviderProper.getBookMetadataFromBook(epubBook)!

      expect(patch.title).toBe('The Incomplete Theft')
      expect(patch.summary).toBeNull()
      expect(patch.releaseDate).toEqual(LocalDate.of(2021, 6, 20))
      expectExactlyInAnyOrder(patch.authors, new Author({ name: 'Ralph Burke', role: 'writer' }))
      expect(patch.isbn).toBeNull()
      expect(patch.number).toBeNull()
      expect(patch.numberSort).toBeNull()
    })

    it('given epub 2 opf when getting book metadata then metadata patch is valid', () => {
      const opf = classPathResourceText('epub/1979.opf')
      mocks.getPackageFileContent = () => opf

      const patch = epubMetadataProvider.getBookMetadataFromBook(new BookWithMedia({ book, media }))!

      expect(patch.title).toBe('1979')
      expect(patch.summary).toBe(
        'Auf dem Weg nach Teheran sah ich aus dem Autofenster, mir wurde etwas übel und ich hielt mich an Christophers Knie fest. Sein Hosenbein war von den aufgeplatzten Blasen ganz naß. Wir fuhren an endlosen Reihen von Birken vorbei. Ich schlief.Später hielten wir an, um uns zu erfrischen. Ich trank ein Glas Tee, Christopher eine Limonade. Es wurde sehr rasch Nacht.Es gab einige Militärkontrollen, denn seit September herrschte Kriegsrecht, was ja eigentlich nichts zu bedeuten hatte in diesen Ländern, sagte Christopher. Wir wurden weitergewunken, einmal sah ich einen Arm, eine weiße Bandage darum und eine Taschenlampe, die uns ins Gesicht schien, dann ging es weiter.Die Luft war staubig, ab und zu roch es im Wagen nach Mais. Wir hatten nur zwei Kassetten dabei; wir hörten erst Blondie, dann Devo, dann wieder Blondie. Es waren Christophers Kassetten.CHRISTIAN KRACHT, 1966 geboren, ist Schweizer. Das Foto zeigt den Autor auf der Landstraße nach Tashigang, Tibet, Volksrepublik China.GESTALTUNG: PAUL BARNES UND PETER SAVILLEFOTO: ECKHART NICKEL',
      )
      expect(patch.releaseDate).toEqual(LocalDate.of(101, 1, 1))
      expectExactlyInAnyOrder(patch.authors, new Author({ name: 'Kracht, Christian', role: 'writer' }), new Author({ name: 'The Editor', role: 'editor' }))
      expect(patch.isbn).toBeNull()
      expect(patch.number).toBeNull()
      expect(patch.numberSort).toBeNull()
    })
  })

  describe('Series', () => {
    it.each(['epub/Panik im Paradies.opf', 'epub/Panik im Paradies - namespace.opf'])(
      'given epub 3 opf when getting series metadata then metadata patch is valid',
      (opfFile) => {
        const opf = classPathResourceText(opfFile)
        mocks.getPackageFileContent = () => opf

        const patch = epubMetadataProvider.getSeriesMetadataFromBook(new BookWithMedia({ book, media }), true)!

        expect(patch.title).toBe('Die drei ??? Kids')
        expect(patch.titleSort).toBe('Die drei ??? Kids')
        expect(patch.readingDirection).toBe(SeriesMetadata.ReadingDirection.RIGHT_TO_LEFT)
        expect(patch.publisher).toBe('Kosmos')
        expect(patch.language).toBe('de')
        expectExactlyInAnyOrder(patch.genres, 'Kinder- und Jugendbücher')
      },
    )

    it('given another epub 3 opf when getting series metadata then metadata patch is valid', () => {
      const opf = classPathResourceText('epub/Die Drei 3.opf')
      mocks.getPackageFileContent = () => opf

      const patch = epubMetadataProvider.getSeriesMetadataFromBook(new BookWithMedia({ book, media }), true)!

      expect(patch.title).toBe('Die drei ??? Kids')
      expect(patch.titleSort).toBe('Die drei ??? Kids')
      expect(patch.readingDirection).toBeNull()
      expect(patch.publisher).toBe('Franckh-Kosmos Verlag')
      expect(patch.language).toBe('de')
      expectExactlyInAnyOrder(patch.genres, 'Kinder- und Jugendbücher', 'Juvenile Fiction', 'Mysteries & Detective Stories')
    })

    it('given epub 2 opf when getting series metadata then metadata patch is valid', () => {
      const opf = classPathResourceText('epub/1979.opf')
      mocks.getPackageFileContent = () => opf

      const patch = epubMetadataProvider.getSeriesMetadataFromBook(new BookWithMedia({ book, media }), true)!

      expect(patch.title).toBeNull()
      expect(patch.titleSort).toBeNull()
      expect(patch.readingDirection).toBeNull()
      expect(patch.publisher).toBeNull()
      expect(patch.language).toBe('de')
      expect(patch.genres).toBeNull()
    })
  })
})
