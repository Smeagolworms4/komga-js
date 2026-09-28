// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/HistoricalEvent.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { str } from '../../port/kotlin.js'
import { TsidCreator } from '../../port/tsid.js'
import type { Book } from './Book.js'
import type { BookPageNumbered } from './BookPageNumbered.js'
import type { Series } from './Series.js'

type HistoricalEventParams = {
  type: string
  bookId?: string | null
  seriesId?: string | null
  properties?: Map<string, string>
  timestamp?: LocalDateTime
  id?: string
}

export abstract class HistoricalEvent {
  readonly type: string
  readonly bookId: string | null
  readonly seriesId: string | null
  readonly properties: Map<string, string>
  readonly timestamp: LocalDateTime
  readonly id: string

  constructor({
    type,
    bookId = null,
    seriesId = null,
    properties = new Map(),
    timestamp = LocalDateTime.now(),
    id = TsidCreator.getTsid256().toString(),
  }: HistoricalEventParams) {
    this.type = type
    this.bookId = bookId
    this.seriesId = seriesId
    this.properties = properties
    this.timestamp = timestamp
    this.id = id
  }
}

export namespace HistoricalEvent {
  export class BookFileDeleted extends HistoricalEvent {
    constructor({ book, reason }: { book: Book; reason: string }) {
      super({
        type: 'BookFileDeleted',
        bookId: book.id,
        seriesId: book.seriesId,
        properties: new Map([
          ['reason', reason],
          ['name', book.path.toString()],
        ]),
      })
    }
  }

  export class SeriesFolderDeleted extends HistoricalEvent {
    // PORT: constructeur principal (seriesId, seriesPath, reason) et constructeur secondaire (series, reason) fusionnés
    constructor(
      params: { seriesId: string; seriesPath: string; reason: string } | { series: Series; reason: string },
    ) {
      const { seriesId, seriesPath, reason } =
        'series' in params
          ? { seriesId: params.series.id, seriesPath: params.series.path, reason: params.reason }
          : params
      super({
        type: 'SeriesFolderDeleted',
        seriesId: seriesId,
        properties: new Map([
          ['reason', reason],
          ['name', seriesPath.toString()],
        ]),
      })
    }
  }

  export class BookConverted extends HistoricalEvent {
    constructor({ book, previous }: { book: Book; previous: Book }) {
      super({
        type: 'BookConverted',
        bookId: book.id,
        seriesId: book.seriesId,
        properties: new Map([
          ['name', book.path.toString()],
          ['former file', previous.path.toString()],
        ]),
      })
    }
  }

  export class BookImported extends HistoricalEvent {
    constructor({ book, series, source, upgrade }: { book: Book; series: Series; source: string; upgrade: boolean }) {
      super({
        type: 'BookImported',
        bookId: book.id,
        seriesId: series.id,
        properties: new Map([
          ['name', book.path.toString()],
          ['source', source.toString()],
          ['upgrade', upgrade ? 'Yes' : 'No'],
        ]),
      })
    }
  }

  export class DuplicatePageDeleted extends HistoricalEvent {
    constructor({ book, page }: { book: Book; page: BookPageNumbered }) {
      super({
        type: 'DuplicatePageDeleted',
        bookId: book.id,
        seriesId: book.seriesId,
        properties: new Map([
          ['name', book.path.toString()],
          ['page number', page.pageNumber.toString()],
          ['page file name', page.fileName],
          ['page file hash', page.fileHash],
          ['page file size', str(page.fileSize)],
          ['page media type', page.mediaType],
        ]),
      })
    }
  }
}
