// @port-of komga/src/test/kotlin/org/gotson/komga/domain/model/Utils.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime } from '@js-joda/core'
import { Book } from '../../../src/domain/model/Book.js'
import { BookPage } from '../../../src/domain/model/BookPage.js'
import { Library } from '../../../src/domain/model/Library.js'
import { Series } from '../../../src/domain/model/Series.js'
import { threadSleep } from '../../../src/port/kotlin.js'
import { TsidCreator } from '../../../src/port/tsid.js'

export function makeBook(
  name: string,
  {
    fileLastModified = LocalDateTime.now(),
    libraryId = '',
    seriesId = '',
    url = null,
    id = TsidCreator.getTsid256().toString(),
  }: {
    fileLastModified?: LocalDateTime
    libraryId?: string
    seriesId?: string
    url?: URL | null
    id?: string
  } = {},
): Book {
  threadSleep(5)
  return new Book({
    name: name,
    url: url ?? new URL(`file:/${name.replaceAll(' ', '_')}`),
    fileLastModified: fileLastModified,
    libraryId: libraryId,
    seriesId: seriesId,
    id: id,
  })
}

export function makeSeries(
  name: string,
  { libraryId = '', url = null }: { libraryId?: string; url?: URL | null } = {},
): Series {
  threadSleep(5)
  return new Series({
    name: name,
    url: url ?? new URL(`file:/${name.replaceAll(' ', '_')}`),
    fileLastModified: LocalDateTime.now(),
    libraryId: libraryId,
  })
}

export function makeLibrary({
  name = 'default',
  path = `file:/${name.replaceAll(' ', '_')}`,
  id = TsidCreator.getTsid256().toString(),
  url = null,
}: { name?: string; path?: string; id?: string; url?: URL | null } = {}): Library {
  return new Library({
    name: name,
    root: url ?? new URL(path),
    id: id,
  })
}

export function makeBookPage(name: string): BookPage {
  return new BookPage({ fileName: name, mediaType: 'image/png' })
}
