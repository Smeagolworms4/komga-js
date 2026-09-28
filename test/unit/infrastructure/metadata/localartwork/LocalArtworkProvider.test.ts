// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/metadata/localartwork/LocalArtworkProviderOracleTest.kt
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Series } from '../../../../../src/domain/model/Series.js'
import type { ThumbnailBook } from '../../../../../src/domain/model/ThumbnailBook.js'
import type { ThumbnailSeries } from '../../../../../src/domain/model/ThumbnailSeries.js'
import { ImageAnalyzer } from '../../../../../src/infrastructure/image/ImageAnalyzer.js'
import { ContentDetector } from '../../../../../src/infrastructure/mediacontainer/ContentDetector.js'
import { LocalArtworkProvider } from '../../../../../src/infrastructure/metadata/localartwork/LocalArtworkProvider.js'
import { pathToUrl, urlToPath } from '../../../../../src/port/java-net.js'
import { nn } from '../../../../../src/port/kotlin.js'
import { TikaConfig } from '../../../../../src/port/tika.js'
import { oracle, tempDir } from '../../../oracle.js'
import { komgaRes } from '../../mediacontainer/samples.js'
import { book, date } from '../metadataSamples.js'

const { func, kase } = oracle('infrastructure/metadata/localartwork/LocalArtworkProvider')

const provider = new LocalArtworkProvider(new ContentDetector(new TikaConfig()), new ImageAnalyzer())

const png = readFileSync(komgaRes('barcode/komga.png'))
const jpg = readFileSync(komgaRes('hashpage/e-sou.jpeg/1.jpg'))
const webp = readFileSync(komgaRes('hashpage/e-sou.webp/1.webp'))
const gif = readFileSync(komgaRes('hashpage/tr.gif/1.gif'))
const text = Buffer.from('text')

type Files = [string, Uint8Array | null][]

function files(dir: string, content: Files): string {
  mkdirSync(dir, { recursive: true })
  for (const [name, c] of content) {
    if (c === null) mkdirSync(join(dir, name), { recursive: true })
    else writeFileSync(join(dir, name), c)
  }
  return dir
}

const byName = (a: unknown[], b: unknown[]) => ((a[0] as string) < (b[0] as string) ? -1 : (a[0] as string) > (b[0] as string) ? 1 : 0)

/** Ordre du répertoire non spécifié : miniatures triées par nom de fichier, et nombre de miniatures sélectionnées */
const books = (thumbnails: ThumbnailBook[]) => [
  thumbnails.map((it) => [basename(urlToPath(nn(it.url))), it.type, it.bookId, it.fileSize, it.mediaType, it.dimension]).sort(byName),
  thumbnails.filter((it) => it.selected).length,
]

const series = (thumbnails: ThumbnailSeries[]) => [
  thumbnails.map((it) => [basename(urlToPath(nn(it.url))), it.type, it.seriesId, it.fileSize, it.mediaType, it.dimension]).sort(byName),
  thumbnails.filter((it) => it.selected).length,
]

const bookDirs: [string, string, Files][] = [
  ['no sidecar', 'Book.cbz', [['Book.cbz', png]]],
  [
    'all extensions',
    'Book.cbz',
    [
      ['Book.cbz', png],
      ['Book.png', png],
      ['Book.jpg', jpg],
      ['Book.jpeg', jpg],
      ['Book.webp', webp],
      ['Book.gif', gif],
      ['Book.tbn', png],
      ['Book.bmp', png],
      ['Book.txt', png],
    ],
  ],
  [
    'numbered and case',
    'Book.cbz',
    [
      ['Book.cbz', png],
      ['book-1.PNG', png],
      ['BOOK-22.Jpg', jpg],
      ['Book-.png', png],
      ['Book-a.png', png],
      ['Book 1.png', png],
      ['Book-1-2.png', png],
      ['Other.png', png],
    ],
  ],
  [
    'not images',
    'Book.cbz',
    [
      ['Book.cbz', png],
      ['Book.png', text],
      ['Book.jpg', new Uint8Array(0)],
      ['Book-1.png', png.subarray(0, 60)],
    ],
  ],
  [
    'directory named like a sidecar',
    'Book.cbz',
    [
      ['Book.cbz', png],
      ['Book.png', null],
    ],
  ],
  [
    'regex characters',
    'Book (1) [x].cbz',
    [
      ['Book (1) [x].cbz', png],
      ['Book (1) [x].png', png],
      ['Book (1) [x]-2.png', png],
      ['Book 1 x.png', png],
    ],
  ],
  [
    'dots in name',
    'My.Book.v1.cbz',
    [
      ['My.Book.v1.cbz', png],
      ['My.Book.v1.png', png],
      ['My.Book.png', png],
      ['My.Book.v1-1.jpg', jpg],
    ],
  ],
  [
    'unicode',
    'Été.cbz',
    [
      ['Été.cbz', png],
      ['ÉTÉ.png', png],
      ['été-1.png', png],
    ],
  ],
]

const seriesDirs: [string, Files][] = [
  ['empty', []],
  [
    'all names',
    [
      ['cover.jpg', jpg],
      ['default.png', png],
      ['folder.webp', webp],
      ['poster.gif', gif],
      ['series.tbn', png],
      ['other.jpg', jpg],
    ],
  ],
  [
    'case',
    [
      ['Cover.JPG', jpg],
      ['FOLDER.Png', png],
      ['Series.JPEG', jpg],
    ],
  ],
  [
    'not images',
    [
      ['cover.jpg', text],
      ['folder.png', new Uint8Array(0)],
      ['poster.png', png.subarray(0, 60)],
    ],
  ],
  [
    'unsupported',
    [
      ['cover.bmp', png],
      ['cover-1.jpg', jpg],
      ['covers.jpg', jpg],
      ['cover', png],
      ['cover.jpg', null],
    ],
  ],
]

func('getBookThumbnails', () => {
  for (const [label, name, content] of bookDirs) {
    kase(label, () => {
      const dir = files(join(tempDir(), `book-${label}`), content)
      return books(provider.getBookThumbnails(book(pathToUrl(join(dir, name)))))
    })
  }
})

func('getSeriesThumbnails', () => {
  for (const [label, content] of seriesDirs) {
    for (const oneshot of [false, true]) {
      kase(`${label} (oneshot ${oneshot})`, () => {
        const dir = files(join(tempDir(), `series-${label}`), content)
        return series(provider.getSeriesThumbnails(new Series({ name: 'series', url: pathToUrl(dir), fileLastModified: date, id: 'SERIES', oneshot, createdDate: date })))
      })
    }
  }
})

func('getSidecarBookType', () => {
  kase('type', () => provider.getSidecarBookType())
})

func('getSidecarSeriesType', () => {
  kase('type', () => provider.getSidecarSeriesType())
})

func('getSidecarSeriesFilenames', () => {
  kase('names', () => provider.getSidecarSeriesFilenames())
})

func('getSidecarBookPrefilter', () => {
  // prettier-ignore
  const names = [
    'a.png', 'a.PNG', 'a-1.jpg', 'a.jpeg', 'a.tbn', 'a.webp', 'a.gif', 'a.bmp', 'a.png.txt', '.png', 'png', 'a-1-2.gif', 'dir/a.jpg', 'a\nb.png', 'a.jpg ',
    'a-x.webp', 'Ä.JPG',
  ]
  kase('matches', () => provider.getSidecarBookPrefilter().map((regex) => names.map((it) => regex.test(it))))
})

func('isSidecarBookMatch', () => {
  const basenames = ['Book', 'book', 'Book (1) [x]', 'a.b', 'Bo*k', '', 'Été', 'Book-1', '\\Q']
  // prettier-ignore
  const sidecars = [
    'Book.jpg', 'book.JPG', 'Book-1.png', 'Book-12.jpg', 'Book-.jpg', 'Book-a.jpg', 'Book 1.jpg', 'Book (1) [x].jpg', 'Book (1) [x]-3.webp', 'a.b.jpg',
    'axb.jpg', 'Bo*k.png', 'Book.tar.gz', '.jpg', 'Book', 'dir/Book.jpg', 'dir\\Book.jpg', 'ÉTÉ.jpg', 'été.jpg', 'Book-1-2.jpg', '\\Q.png',
  ]
  for (const b of basenames) {
    for (const s of sidecars) kase(`'${b}', '${s}'`, () => provider.isSidecarBookMatch(b, s))
  }
})
