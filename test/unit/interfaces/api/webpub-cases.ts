// Miroir de WebPubCases (oracle/interfaces/api/WebPubGeneratorOracleTest.kt) : cas communs des oracles WebPubGenerator et OpdsGenerator.
import { LocalDateTime } from '@js-joda/core'
import { BookPage } from '../../../../src/domain/model/BookPage.js'
import { Dimension } from '../../../../src/domain/model/Dimension.js'
import { EpubTocEntry } from '../../../../src/domain/model/EpubTocEntry.js'
import { Media } from '../../../../src/domain/model/Media.js'
import { MediaExtensionEpub } from '../../../../src/domain/model/MediaExtension.js'
import { MediaFile } from '../../../../src/domain/model/MediaFile.js'
import { MediaProfile } from '../../../../src/domain/model/MediaProfile.js'
import { SeriesMetadata } from '../../../../src/domain/model/SeriesMetadata.js'
import type { WebPubGenerator } from '../../../../src/interfaces/api/WebPubGenerator.js'
import { WPMetadataDto } from '../../../../src/interfaces/api/dto/WepPub.js'
import { AuthorDto } from '../../../../src/interfaces/api/rest/dto/AuthorDto.js'
import type { BookDto } from '../../../../src/interfaces/api/rest/dto/BookDto.js'
import { ServletUriComponentsBuilder, UriComponentsBuilder } from '../../../../src/port/spring-web-uri.js'
import { OracleDb } from '../../db.js'
import type { oracle } from '../../oracle.js'
import { mapper, stableText, request, withRequest } from '../../web-oracle.js'
import { setup } from '../data.js'
import { InterfacesServices } from '../services.js'

export function webPubCases(o: ReturnType<typeof oracle>, generatorOf: (s: InterfacesServices) => WebPubGenerator) {
  const { func, kase, deviation } = o
  const db = new OracleDb()
  const services = new InterfacesServices(db)
  const generator = () => generatorOf(services)

  const json = (v: unknown): string => stableText(mapper().writeValueAsString(v))

  const web = <T>(block: () => T, contextPath = ''): Promise<T> =>
    withRequest(request({ uri: `${contextPath}/api/v1/books/B1/manifest`, host: 'komga.example.org', port: 8443, scheme: 'https', contextPath }), block)

  // PORT: méthodes protégées et fonctions d'extension privées appelées par réflexion côté Kotlin
  const names: Record<string, string> = { toWPLinkDto: 'epubTocEntryToWPLinkDto' }
  const call = (name: string, ...args: unknown[]): unknown => {
    const g = generator() as unknown as Record<string, (...a: unknown[]) => unknown>
    return g[names[name] ?? name]!.apply(g, args)
  }

  const book = (id: string): BookDto => db.bookDtoDao.findByIdOrNull(id, 'U1')!
  const media = (id: string): Media => db.mediaDao.findById(id)
  const seriesMetadata = (id: string): SeriesMetadata => db.seriesMetadataDao.findById(book(id).seriesId)

  const date = LocalDateTime.of(2020, 1, 1, 0, 0)

  const epubMedia = new Media({
    status: Media.Status.READY,
    mediaType: 'application/epub+zip',
    files: [
      new MediaFile({ fileName: 'OEBPS/ch 1.xhtml', mediaType: 'application/xhtml+xml', subType: MediaFile.SubType.EPUB_PAGE, fileSize: 10 }),
      new MediaFile({ fileName: 'OEBPS/style.css', mediaType: 'text/css', subType: MediaFile.SubType.EPUB_ASSET }),
      new MediaFile({ fileName: 'OEBPS/ç#2.xhtml', mediaType: 'application/xhtml+xml', subType: MediaFile.SubType.EPUB_PAGE }),
      new MediaFile({ fileName: 'OEBPS/img/cover.jpg', mediaType: 'image/jpeg', subType: MediaFile.SubType.EPUB_ASSET }),
      new MediaFile({ fileName: 'META-INF/container.xml', mediaType: 'application/xml', subType: null }),
    ],
    extension: new MediaExtensionEpub({
      toc: [
        new EpubTocEntry({ title: 'Chapter 1', href: 'OEBPS/ch 1.xhtml#part-1', children: [new EpubTocEntry({ title: 'Sub', href: 'OEBPS/ch 1.xhtml' })] }),
        new EpubTocEntry({ title: 'No link', href: null }),
        new EpubTocEntry({ title: 'Hash only', href: '#top' }),
      ],
      landmarks: [new EpubTocEntry({ title: 'Cover', href: 'OEBPS/img/cover.jpg' })],
      pageList: [new EpubTocEntry({ title: '1', href: 'OEBPS/ch 1.xhtml#p1' }), new EpubTocEntry({ title: '2', href: 'OEBPS/ç#2.xhtml' })],
      isFixedLayout: true,
    }),
    bookId: 'B4',
    createdDate: date,
  })

  const authors = [
    ['A1', 'author'],
    ['W1', 'writer'],
    ['P1', 'penciller'],
    ['P2', 'penciler'],
    ['T1', 'translator'],
    ['E1', 'editor'],
    ['AR', 'artist'],
    ['I1', 'illustrator'],
    ['L1', 'letterer'],
    ['C1', 'colorist'],
    ['IN', 'inker'],
    ['CV', 'cover'],
    ['A2', 'author'],
  ].map(([name, role]) => new AuthorDto({ name: name!, role: role! }))

  function commonCases() {
    func('toBasePublicationDto', () => {
      kase('setup', () => setup(db))
      for (const id of ['B1', 'B4', 'B5', 'B6']) kase(id, () => web(() => json(call('toBasePublicationDto', book(id)))))
      kase('context path', () => web(() => json(call('toBasePublicationDto', book('B1'))), '/komga'))
    })
    func('getDefaultMediaType', () => {
      kase('media type', () => String(call('getDefaultMediaType')))
    })
    func('buildThumbnailLinkDtos', () => {
      kase('B1', () => web(() => json(call('buildThumbnailLinkDtos', 'B1'))))
      kase('special id', () => web(() => json(call('buildThumbnailLinkDtos', 'a b/c'))))
    })
    func('toManifestDivina', () => {
      for (const id of ['B1', 'B2', 'B3', 'B5']) kase(id, () => web(() => json(generator().toManifestDivina(book(id), media(id), seriesMetadata(id)))))
      // lecteurs JPEG XL / AVIF absents de la JVM des oracles (plugins natifs de l'image Docker de Komga), présents dans KomgaJS
      deviation('pages without dimension, unknown type', 'image/jxl et image/avif convertibles en JPEG (sharp), pas sur la JVM des oracles')
    })
    func('toManifestPdf', () => {
      kase('B5', () => web(() => json(generator().toManifestPdf(book('B5'), media('B5'), seriesMetadata('B5').copy({ readingDirection: SeriesMetadata.ReadingDirection.RIGHT_TO_LEFT })))))
      kase('no page', () => web(() => json(generator().toManifestPdf(book('B5'), media('B5').copy({ pageCount: 0 }), seriesMetadata('B5')))))
    })
    func('toManifestEpub', () => {
      kase('B4 without extension', () => web(() => json(generator().toManifestEpub(book('B4'), media('B4'), seriesMetadata('B4')))))
      kase('B4 with extension', () => web(() => json(generator().toManifestEpub(book('B4'), epubMedia, seriesMetadata('B4').copy({ readingDirection: SeriesMetadata.ReadingDirection.VERTICAL })))))
      kase('reflowable', () =>
        web(() =>
          json(
            generator().toManifestEpub(book('B4'), epubMedia.copy({ extension: (epubMedia.extension as MediaExtensionEpub).copy({ isFixedLayout: false }) }), seriesMetadata('B4')),
          ),
        ),
      )
      kase('proxy extension', () => {
        db.mediaDao.update(epubMedia)
        return web(() => json(generator().toManifestEpub(book('B4'), media('B4'), seriesMetadata('B4'))))
      })
    })
    func('toWPLinkDto', () => {
      kase('toc entries', () =>
        web(() => {
          const builder = ServletUriComponentsBuilder.fromCurrentContextPath().path('x/')
          return json((epubMedia.extension as MediaExtensionEpub).toc.map((it) => call('toWPLinkDto', it, builder)))
        }),
      )
    })
    func('toWPMetadataDto', () => {
      for (const id of ['B1', 'B4', 'B6']) kase(id, () => web(() => json(call('toWPMetadataDto', book(id)))))
    })
    func('getBookSeriesLink', () => {
      kase('B1', () => web(() => json(call('getBookSeriesLink', book('B1')))))
    })
    func('withSeriesMetadata', () => {
      for (const d of [
        null,
        SeriesMetadata.ReadingDirection.LEFT_TO_RIGHT,
        SeriesMetadata.ReadingDirection.RIGHT_TO_LEFT,
        SeriesMetadata.ReadingDirection.VERTICAL,
        SeriesMetadata.ReadingDirection.WEBTOON,
      ])
        kase(`${d === null ? null : d.name}`, () => json(call('withSeriesMetadata', new WPMetadataDto({ title: 't' }), seriesMetadata('B1').copy({ readingDirection: d, language: 'fr-CA' }))))
    })
    func('withAuthors', () => {
      kase('all roles', () => json(call('withAuthors', new WPMetadataDto({ title: 't' }), authors)))
      kase('no author', () => json(call('withAuthors', new WPMetadataDto({ title: 't' }), [])))
    })
    func('getExtraLinkProperties', () => {
      kase('properties', () => web(() => json(call('getExtraLinkProperties'))))
    })
    func('getExtraLinks', () => {
      kase('B1', () => web(() => json(call('getExtraLinks', 'B1'))))
    })
    func('toWPLinkDtos', () => {
      for (const id of ['B1', 'B4', 'B5'])
        kase(id, () => web(() => json(call('toWPLinkDtos', book(id), ServletUriComponentsBuilder.fromCurrentContextPath().pathSegment('api', 'v1')))))
      kase('epub divina compatible', () => {
        db.mediaDao.update(media('B6').copy({ epubDivinaCompatible: true }))
        return web(() => json(call('toWPLinkDtos', book('B6'), UriComponentsBuilder.fromUriString('http://h/p'))))
      })
      kase('unknown media type', () => {
        db.mediaDao.update(media('B3').copy({ mediaType: 'application/x-unknown' }))
        return web(() => json(call('toWPLinkDtos', book('B3'), UriComponentsBuilder.fromUriString('http://h/p'))))
      })
    })
    func('mediaProfileToWebPub', () => {
      for (const p of [...MediaProfile.entries(), null]) kase(`${p === null ? null : p.name}`, () => call('mediaProfileToWebPub', p))
    })
  }

  return { db, services, generator, json, web, book, commonCases }
}
