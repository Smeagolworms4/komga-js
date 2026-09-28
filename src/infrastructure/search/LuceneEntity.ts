// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/search/LuceneEntity.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ReadList } from '../../domain/model/ReadList.js'
import { SeriesCollection } from '../../domain/model/SeriesCollection.js'
import { BookDto } from '../../interfaces/api/rest/dto/BookDto.js'
import { SeriesDto } from '../../interfaces/api/rest/dto/SeriesDto.js'
import { toDate } from '../../language/LanguageUtils.js'
import { isNotBlank, KEnum } from '../../port/kotlin.js'
import { DateTools, Document, Field, StringField, TextField } from '../../port/lucene/document.js'

export class LuceneEntity extends KEnum {
  static readonly Book = new LuceneEntity('Book', 'book', 'book_id', ['title', 'isbn'])
  static readonly Series = new LuceneEntity('Series', 'series', 'series_id', ['title'])
  static readonly Collection = new LuceneEntity('Collection', 'collection', 'collection_id', ['name'])
  static readonly ReadList = new LuceneEntity('ReadList', 'readlist', 'readlist_id', ['name'])

  private constructor(
    name: string,
    readonly type: string,
    readonly id: string,
    readonly defaultFields: string[],
  ) {
    super(name)
  }

  static readonly TYPE = 'type'
}

// PORT: fonctions d'extension surchargées BookDto.toDocument(), SeriesDto.toDocument(), SeriesCollection.toDocument(),
// ReadList.toDocument() -> une seule fonction, aiguillée sur le type du récepteur (dans l'ordre du fichier Kotlin)
export function toDocument(self: BookDto | SeriesDto | SeriesCollection | ReadList): Document {
  if (self instanceof BookDto) {
    const doc = new Document()
    const metadata = self.metadata
    doc.add(new TextField('title', metadata.title, Field.Store.NO))
    doc.add(new TextField('isbn', metadata.isbn, Field.Store.NO))
    metadata.tags.forEach((it) => {
      doc.add(new TextField('tag', it, Field.Store.NO))
    })
    metadata.authors.forEach((it) => {
      doc.add(new TextField('author', it.name, Field.Store.NO))
      doc.add(new TextField(it.role, it.name, Field.Store.NO))
    })
    if (metadata.releaseDate !== null) doc.add(new TextField('release_date', DateTools.dateToString(toDate(metadata.releaseDate), DateTools.Resolution.YEAR), Field.Store.NO))
    doc.add(new TextField('status', self.media.status, Field.Store.NO))
    doc.add(new TextField('deleted', String(self.deleted), Field.Store.NO))
    doc.add(new TextField('oneshot', String(self.oneshot), Field.Store.NO))

    doc.add(new StringField(LuceneEntity.TYPE, LuceneEntity.Book.type, Field.Store.NO))
    doc.add(new StringField(LuceneEntity.Book.id, self.id, Field.Store.YES))
    return doc
  }

  if (self instanceof SeriesDto) {
    const doc = new Document()
    const metadata = self.metadata
    const booksMetadata = self.booksMetadata
    doc.add(new TextField('title', metadata.title, Field.Store.NO))
    if (metadata.titleSort !== metadata.title) doc.add(new TextField('title', metadata.titleSort, Field.Store.NO))
    metadata.alternateTitles.forEach((it) => {
      doc.add(new TextField('title', it.title, Field.Store.NO))
    })
    doc.add(new TextField('publisher', metadata.publisher, Field.Store.NO))
    doc.add(new TextField('status', metadata.status, Field.Store.NO))
    doc.add(new TextField('reading_direction', metadata.readingDirection, Field.Store.NO))
    if (metadata.ageRating !== null) doc.add(new TextField('age_rating', String(metadata.ageRating), Field.Store.NO))
    if (isNotBlank(metadata.language)) doc.add(new TextField('language', metadata.language, Field.Store.NO))
    metadata.tags.forEach((it) => {
      doc.add(new TextField('series_tag', it, Field.Store.NO))
      doc.add(new TextField('tag', it, Field.Store.NO))
    })
    booksMetadata.tags.forEach((it) => {
      doc.add(new TextField('book_tag', it, Field.Store.NO))
      doc.add(new TextField('tag', it, Field.Store.NO))
    })
    metadata.genres.forEach((it) => {
      doc.add(new TextField('genre', it, Field.Store.NO))
    })
    metadata.sharingLabels.forEach((it) => {
      doc.add(new TextField('sharing_label', it, Field.Store.NO))
    })
    if (metadata.totalBookCount !== null) doc.add(new TextField('total_book_count', String(metadata.totalBookCount), Field.Store.NO))
    doc.add(new TextField('book_count', String(self.booksCount), Field.Store.NO))
    booksMetadata.authors.forEach((it) => {
      doc.add(new TextField('author', it.name, Field.Store.NO))
      doc.add(new TextField(it.role, it.name, Field.Store.NO))
    })
    if (booksMetadata.releaseDate !== null) doc.add(new TextField('release_date', DateTools.dateToString(toDate(booksMetadata.releaseDate), DateTools.Resolution.YEAR), Field.Store.NO))
    doc.add(new TextField('deleted', String(self.deleted), Field.Store.NO))
    doc.add(new TextField('oneshot', String(self.oneshot), Field.Store.NO))
    if (metadata.totalBookCount !== null) doc.add(new TextField('complete', String(metadata.totalBookCount === self.booksCount), Field.Store.NO))

    doc.add(new StringField(LuceneEntity.TYPE, LuceneEntity.Series.type, Field.Store.NO))
    doc.add(new StringField(LuceneEntity.Series.id, self.id, Field.Store.YES))
    return doc
  }

  if (self instanceof SeriesCollection) {
    const doc = new Document()
    doc.add(new TextField('name', self.name, Field.Store.NO))
    doc.add(new StringField(LuceneEntity.TYPE, LuceneEntity.Collection.type, Field.Store.NO))
    doc.add(new StringField(LuceneEntity.Collection.id, self.id, Field.Store.YES))
    return doc
  }

  // ReadList.toDocument()
  const doc = new Document()
  doc.add(new TextField('name', self.name, Field.Store.NO))
  doc.add(new StringField(LuceneEntity.TYPE, LuceneEntity.ReadList.type, Field.Store.NO))
  doc.add(new StringField(LuceneEntity.ReadList.id, self.id, Field.Store.YES))
  return doc
}

export function oneshotDocument(self: SeriesDto, document: Document): Document {
  const metadata = self.metadata
  document.add(new TextField('publisher', metadata.publisher, Field.Store.NO))
  document.add(new TextField('status', metadata.status, Field.Store.NO))
  document.add(new TextField('reading_direction', metadata.readingDirection, Field.Store.NO))
  if (metadata.ageRating !== null) document.add(new TextField('age_rating', String(metadata.ageRating), Field.Store.NO))
  if (isNotBlank(metadata.language)) document.add(new TextField('language', metadata.language, Field.Store.NO))
  metadata.genres.forEach((it) => {
    document.add(new TextField('genre', it, Field.Store.NO))
  })
  metadata.sharingLabels.forEach((it) => {
    document.add(new TextField('sharing_label', it, Field.Store.NO))
  })
  document.add(new TextField('complete', 'true', Field.Store.NO))
  return document
}
