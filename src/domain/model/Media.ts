// @port-of komga/src/main/kotlin/org/gotson/komga/domain/model/Media.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { DataClass, KEnum, lazy, str } from '../../port/kotlin.js'
import type { Auditable } from './Auditable.js'
import type { BookPage } from './BookPage.js'
import type { MediaExtension } from './MediaExtension.js'
import type { MediaFile } from './MediaFile.js'
import type { MediaProfile } from './MediaProfile.js'
import { MediaType } from './MediaType.js'

type MediaParams = {
  status?: Media.Status
  mediaType?: string | null
  pages?: BookPage[]
  pageCount?: number
  files?: MediaFile[]
  comment?: string | null
  extension?: MediaExtension | null
  bookId?: string
  epubDivinaCompatible?: boolean
  epubIsKepub?: boolean
  createdDate?: LocalDateTime
  lastModifiedDate?: LocalDateTime
}

export class Media extends DataClass<MediaParams> implements Auditable {
  readonly status: Media.Status
  readonly mediaType: string | null
  readonly pages: BookPage[]
  readonly pageCount: number
  readonly files: MediaFile[]
  readonly comment: string | null
  readonly extension: MediaExtension | null
  readonly bookId: string
  readonly epubDivinaCompatible: boolean
  readonly epubIsKepub: boolean
  readonly createdDate: LocalDateTime
  readonly lastModifiedDate: LocalDateTime

  constructor({
    status = Media.Status.UNKNOWN,
    mediaType = null,
    pages = [],
    pageCount = pages.length,
    files = [],
    comment = null,
    extension = null,
    bookId = '',
    epubDivinaCompatible = false,
    epubIsKepub = false,
    createdDate = LocalDateTime.now(),
    lastModifiedDate = createdDate,
  }: MediaParams = {}) {
    super()
    this.status = status
    this.mediaType = mediaType
    this.pages = pages
    this.pageCount = pageCount
    this.files = files
    this.comment = comment
    this.extension = extension
    this.bookId = bookId
    this.epubDivinaCompatible = epubDivinaCompatible
    this.epubIsKepub = epubIsKepub
    this.createdDate = createdDate
    this.lastModifiedDate = lastModifiedDate
  }

  get profile(): MediaProfile | null {
    return lazy(this, 'profile', () => MediaType.fromMediaType(this.mediaType)?.profile ?? null)
  }

  toString(): string {
    return `Media(status=${this.status}, mediaType=${str(this.mediaType)}, comment=${str(this.comment)}, bookId='${this.bookId}', createdDate=${this.createdDate}, lastModifiedDate=${this.lastModifiedDate})`
  }
}

export namespace Media {
  export class Status extends KEnum {
    static readonly UNKNOWN = new Status('UNKNOWN')
    static readonly ERROR = new Status('ERROR')
    static readonly READY = new Status('READY')
    static readonly UNSUPPORTED = new Status('UNSUPPORTED')
    static readonly OUTDATED = new Status('OUTDATED')
  }
}
