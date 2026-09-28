// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/comicrack/ReadListProvider.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ComicRackListException } from '../../../domain/model/Exceptions.js'
import { ReadListRequest, ReadListRequestBook } from '../../../domain/model/ReadListRequest.js'
import { XmlMapper } from '../../../port/jackson-xml.js'
import { isBlank, isNullOrBlank, nn, str, trim } from '../../../port/kotlin.js'
import { KotlinLogging } from '../../../port/logging.js'
import { component } from '../../../port/spring.js'
import { computeSeriesFromSeriesAndVolume } from './ComicInfoProvider.js'
import { ReadingList } from './dto/ReadingList.js'

const logger = KotlinLogging.logger('org.gotson.komga.infrastructure.metadata.comicrack.ReadListProvider')

export class ReadListProvider {
  private readonly mapper: XmlMapper

  // PORT: @Autowired(required = false) avec valeur par défaut : null -> XmlMapper()
  constructor(mapper: XmlMapper | null = null) {
    this.mapper = mapper ?? new XmlMapper()
  }

  // @Throws(ComicRackListException::class)
  importFromCbl(cbl: Uint8Array): ReadListRequest {
    let readingList: ReadingList
    try {
      // PORT: type plateforme : null pour une racine xsi:nil, comme en Kotlin (NullPointerException plus bas -> TypeError)
      readingList = this.mapper.readValue<ReadingList>(cbl, { class: ReadingList })
    } catch (e) {
      logger.error(e as Error, () => 'Error while trying to parse ComicRack ReadingList')
      throw new ComicRackListException('Error while trying to parse ComicRack ReadingList', 'ERR_1015')
    }
    logger.debug(() => `Trying to convert ComicRack ReadingList to ReadListRequest: ${str(readingList)}`)

    if (isNullOrBlank(readingList.name)) throw new ComicRackListException('ReadingList has no Name element', 'ERR_1030')
    if (readingList.books.length === 0) throw new ComicRackListException('ReadingList does not contain any Book element', 'ERR_1029')

    const books = readingList.books.map((it) => {
      if (isNullOrBlank(it.series) || it.number === null) throw new ComicRackListException(`Book is missing series or number: ${str(it)}`, 'ERR_1031')
      const series = new Set(
        [computeSeriesFromSeriesAndVolume(it.series, it.volume), it.series !== null && isBlank(it.series) ? null : it.series].filter((s): s is string => s !== null),
      )
      return new ReadListRequestBook({ series: series, number: trim(nn(it.number)) })
    })

    const request = new ReadListRequest({ name: nn(readingList.name), books: books })
    logger.debug(() => `Converted request: ${str(request)}`)
    return request
  }
}

// @Service
component(ReadListProvider, { inject: [{ optional: XmlMapper }] })
