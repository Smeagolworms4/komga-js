// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/SeriesMetadataDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LocalDateTime, ZoneId } from '@js-joda/core'
import { AlternateTitle } from '../../../domain/model/AlternateTitle.js'
import { SeriesMetadata } from '../../../domain/model/SeriesMetadata.js'
import { WebLink } from '../../../domain/model/WebLink.js'
import { SeriesMetadataRepository } from '../../../domain/persistence/SeriesMetadataRepository.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'
import { type SeriesMetadataRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { toCurrentTimeZone } from '../../../language/LanguageUtils.js'
import { DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { component } from '../../../port/spring.js'
import { URI } from '../../../port/java-net.js'
import { chunked, nn } from '../../../port/kotlin.js'

export class SeriesMetadataDao extends SplitDslDaoBase implements SeriesMetadataRepository {
  private readonly d = Tables.SERIES_METADATA
  private readonly g = Tables.SERIES_METADATA_GENRE
  private readonly st = Tables.SERIES_METADATA_TAG
  private readonly sl = Tables.SERIES_METADATA_SHARING
  private readonly slk = Tables.SERIES_METADATA_LINK
  private readonly sat = Tables.SERIES_METADATA_ALTERNATE_TITLE

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly batchSize: number,
  ) {
    super(dslRW, dslRO)
  }

  findById(seriesId: string): SeriesMetadata {
    return this.toDomain(
      nn(this.findOne(this.dslRO, seriesId)),
      this.findGenres(this.dslRO, seriesId),
      this.findTags(this.dslRO, seriesId),
      this.findSharingLabels(this.dslRO, seriesId),
      this.findLinks(this.dslRO, seriesId),
      this.findAlternateTitles(this.dslRO, seriesId),
    )
  }

  findByIdOrNull(seriesId: string): SeriesMetadata | null {
    const it = this.findOne(this.dslRO, seriesId)
    return it !== null
      ? this.toDomain(
          it,
          this.findGenres(this.dslRO, seriesId),
          this.findTags(this.dslRO, seriesId),
          this.findSharingLabels(this.dslRO, seriesId),
          this.findLinks(this.dslRO, seriesId),
          this.findAlternateTitles(this.dslRO, seriesId),
        )
      : null
  }

  private findOne(self: DSLContext, seriesId: string): SeriesMetadataRecord | null {
    return self.selectFrom(this.d).where(this.d.SERIES_ID.eq(seriesId)).fetchOneInto(this.d)
  }

  private findGenres(self: DSLContext, seriesId: string): Set<string> {
    return self.select(this.g.GENRE).from(this.g).where(this.g.SERIES_ID.eq(seriesId)).fetchSet(this.g.GENRE)
  }

  private findTags(self: DSLContext, seriesId: string): Set<string> {
    return self.select(this.st.TAG).from(this.st).where(this.st.SERIES_ID.eq(seriesId)).fetchSet(this.st.TAG)
  }

  private findSharingLabels(self: DSLContext, seriesId: string): Set<string> {
    return self.select(this.sl.LABEL).from(this.sl).where(this.sl.SERIES_ID.eq(seriesId)).fetchSet(this.sl.LABEL)
  }

  private findLinks(self: DSLContext, seriesId: string): WebLink[] {
    return self
      .select(this.slk.LABEL, this.slk.URL)
      .from(this.slk)
      .where(this.slk.SERIES_ID.eq(seriesId))
      .fetchInto(this.slk)
      .map((it) => new WebLink({ label: it.label, url: new URI(it.url) }))
  }

  private findAlternateTitles(self: DSLContext, seriesId: string): AlternateTitle[] {
    return self
      .select(this.sat.LABEL, this.sat.TITLE)
      .from(this.sat)
      .where(this.sat.SERIES_ID.eq(seriesId))
      .fetchInto(this.sat)
      .map((it) => new AlternateTitle({ label: it.label, title: it.title }))
  }

  // @Transactional
  insert(metadata: SeriesMetadata): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .insertInto(this.d)
        .set(this.d.SERIES_ID, metadata.seriesId)
        .set(this.d.STATUS, metadata.status.toString())
        .set(this.d.TITLE, metadata.title)
        .set(this.d.TITLE_SORT, metadata.titleSort)
        .set(this.d.SUMMARY, metadata.summary)
        .set(this.d.READING_DIRECTION, metadata.readingDirection?.toString() ?? null)
        .set(this.d.PUBLISHER, metadata.publisher)
        .set(this.d.AGE_RATING, metadata.ageRating)
        .set(this.d.LANGUAGE, metadata.language)
        .set(this.d.STATUS_LOCK, metadata.statusLock)
        .set(this.d.TITLE_LOCK, metadata.titleLock)
        .set(this.d.TITLE_SORT_LOCK, metadata.titleSortLock)
        .set(this.d.SUMMARY_LOCK, metadata.summaryLock)
        .set(this.d.READING_DIRECTION_LOCK, metadata.readingDirectionLock)
        .set(this.d.PUBLISHER_LOCK, metadata.publisherLock)
        .set(this.d.AGE_RATING_LOCK, metadata.ageRatingLock)
        .set(this.d.LANGUAGE_LOCK, metadata.languageLock)
        .set(this.d.GENRES_LOCK, metadata.genresLock)
        .set(this.d.TAGS_LOCK, metadata.tagsLock)
        .set(this.d.TOTAL_BOOK_COUNT, metadata.totalBookCount)
        .set(this.d.TOTAL_BOOK_COUNT_LOCK, metadata.totalBookCountLock)
        .set(this.d.SHARING_LABELS_LOCK, metadata.sharingLabelsLock)
        .set(this.d.LINKS_LOCK, metadata.linksLock)
        .set(this.d.ALTERNATE_TITLES_LOCK, metadata.alternateTitlesLock)
        .execute()

      this.insertGenres(this.dslRW, metadata)
      this.insertTags(this.dslRW, metadata)
      this.insertSharingLabels(this.dslRW, metadata)
      this.insertLinks(this.dslRW, metadata)
      this.insertAlternateTitles(this.dslRW, metadata)
    })
  }

  // @Transactional
  update(metadata: SeriesMetadata): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .update(this.d)
        .set(this.d.STATUS, metadata.status.toString())
        .set(this.d.TITLE, metadata.title)
        .set(this.d.TITLE_SORT, metadata.titleSort)
        .set(this.d.SUMMARY, metadata.summary)
        .set(this.d.READING_DIRECTION, metadata.readingDirection?.toString() ?? null)
        .set(this.d.PUBLISHER, metadata.publisher)
        .set(this.d.AGE_RATING, metadata.ageRating)
        .set(this.d.LANGUAGE, metadata.language)
        .set(this.d.STATUS_LOCK, metadata.statusLock)
        .set(this.d.TITLE_LOCK, metadata.titleLock)
        .set(this.d.TITLE_SORT_LOCK, metadata.titleSortLock)
        .set(this.d.SUMMARY_LOCK, metadata.summaryLock)
        .set(this.d.READING_DIRECTION_LOCK, metadata.readingDirectionLock)
        .set(this.d.PUBLISHER_LOCK, metadata.publisherLock)
        .set(this.d.AGE_RATING_LOCK, metadata.ageRatingLock)
        .set(this.d.LANGUAGE_LOCK, metadata.languageLock)
        .set(this.d.GENRES_LOCK, metadata.genresLock)
        .set(this.d.TAGS_LOCK, metadata.tagsLock)
        .set(this.d.TOTAL_BOOK_COUNT, metadata.totalBookCount)
        .set(this.d.TOTAL_BOOK_COUNT_LOCK, metadata.totalBookCountLock)
        .set(this.d.SHARING_LABELS_LOCK, metadata.sharingLabelsLock)
        .set(this.d.LINKS_LOCK, metadata.linksLock)
        .set(this.d.ALTERNATE_TITLES_LOCK, metadata.alternateTitlesLock)
        .set(this.d.LAST_MODIFIED_DATE, LocalDateTime.now(ZoneId.of('Z')))
        .where(this.d.SERIES_ID.eq(metadata.seriesId))
        .execute()

      this.dslRW.deleteFrom(this.g).where(this.g.SERIES_ID.eq(metadata.seriesId)).execute()

      this.dslRW.deleteFrom(this.st).where(this.st.SERIES_ID.eq(metadata.seriesId)).execute()

      this.dslRW.deleteFrom(this.sl).where(this.sl.SERIES_ID.eq(metadata.seriesId)).execute()

      this.dslRW.deleteFrom(this.slk).where(this.slk.SERIES_ID.eq(metadata.seriesId)).execute()

      this.dslRW.deleteFrom(this.sat).where(this.sat.SERIES_ID.eq(metadata.seriesId)).execute()

      this.insertGenres(this.dslRW, metadata)
      this.insertTags(this.dslRW, metadata)
      this.insertSharingLabels(this.dslRW, metadata)
      this.insertLinks(this.dslRW, metadata)
      this.insertAlternateTitles(this.dslRW, metadata)
    })
  }

  private insertGenres(self: DSLContext, metadata: SeriesMetadata): void {
    if (metadata.genres.size > 0) {
      for (const chunk of chunked([...metadata.genres], this.batchSize)) {
        const step = self.batch(self.insertInto(this.g, this.g.SERIES_ID, this.g.GENRE).values(null, null))
        for (const it of chunk) {
          step.bind(metadata.seriesId, it)
        }
        step.execute()
      }
    }
  }

  private insertTags(self: DSLContext, metadata: SeriesMetadata): void {
    if (metadata.tags.size > 0) {
      for (const chunk of chunked([...metadata.tags], this.batchSize)) {
        const step = self.batch(self.insertInto(this.st, this.st.SERIES_ID, this.st.TAG).values(null, null))
        for (const it of chunk) {
          step.bind(metadata.seriesId, it)
        }
        step.execute()
      }
    }
  }

  private insertSharingLabels(self: DSLContext, metadata: SeriesMetadata): void {
    if (metadata.sharingLabels.size > 0) {
      for (const chunk of chunked([...metadata.sharingLabels], this.batchSize)) {
        const step = self.batch(self.insertInto(this.sl, this.sl.SERIES_ID, this.sl.LABEL).values(null, null))
        for (const it of chunk) {
          step.bind(metadata.seriesId, it)
        }
        step.execute()
      }
    }
  }

  private insertLinks(self: DSLContext, metadata: SeriesMetadata): void {
    if (metadata.links.length > 0) {
      for (const chunk of chunked(metadata.links, this.batchSize)) {
        const step = self.batch(self.insertInto(this.slk, this.slk.SERIES_ID, this.slk.LABEL, this.slk.URL).values(null, null, null))
        for (const it of chunk) {
          step.bind(metadata.seriesId, it.label, it.url.toString())
        }
        step.execute()
      }
    }
  }

  private insertAlternateTitles(self: DSLContext, metadata: SeriesMetadata): void {
    if (metadata.alternateTitles.length > 0) {
      for (const chunk of chunked(metadata.alternateTitles, this.batchSize)) {
        const step = self.batch(self.insertInto(this.sat, this.sat.SERIES_ID, this.sat.LABEL, this.sat.TITLE).values(null, null, null))
        for (const it of chunk) {
          step.bind(metadata.seriesId, it.label, it.title)
        }
        step.execute()
      }
    }
  }

  // PORT: surcharges delete(String) / delete(Collection<String>) fusionnées (union de types)
  // @Transactional
  delete(seriesIdOrIds: string | Iterable<string>): void {
    transactional(this.dslRW.db, () => {
      if (typeof seriesIdOrIds === 'string') {
        const seriesId = seriesIdOrIds
        this.dslRW.deleteFrom(this.g).where(this.g.SERIES_ID.eq(seriesId)).execute()
        this.dslRW.deleteFrom(this.st).where(this.st.SERIES_ID.eq(seriesId)).execute()
        this.dslRW.deleteFrom(this.sl).where(this.sl.SERIES_ID.eq(seriesId)).execute()
        this.dslRW.deleteFrom(this.slk).where(this.slk.SERIES_ID.eq(seriesId)).execute()
        this.dslRW.deleteFrom(this.sat).where(this.sat.SERIES_ID.eq(seriesId)).execute()
        this.dslRW.deleteFrom(this.d).where(this.d.SERIES_ID.eq(seriesId)).execute()
      } else {
        // PORT: override fun delete(seriesIds: Collection<String>)
        const seriesIds = seriesIdOrIds
        use(TempTable.withTempTable(this.dslRW, this.batchSize, seriesIds), (it) => {
          this.dslRW.deleteFrom(this.g).where(this.g.SERIES_ID.in(it.selectTempStrings())).execute()
          this.dslRW.deleteFrom(this.st).where(this.st.SERIES_ID.in(it.selectTempStrings())).execute()
          this.dslRW.deleteFrom(this.sl).where(this.sl.SERIES_ID.in(it.selectTempStrings())).execute()
          this.dslRW.deleteFrom(this.slk).where(this.slk.SERIES_ID.in(it.selectTempStrings())).execute()
          this.dslRW.deleteFrom(this.sat).where(this.sat.SERIES_ID.in(it.selectTempStrings())).execute()
          this.dslRW.deleteFrom(this.d).where(this.d.SERIES_ID.in(it.selectTempStrings())).execute()
        })
      }
    })
  }

  count(): number {
    return this.dslRO.fetchCount(this.d)
  }

  private toDomain(
    self: SeriesMetadataRecord,
    genres: Set<string>,
    tags: Set<string>,
    sharingLabels: Set<string>,
    links: WebLink[],
    alternateTitles: AlternateTitle[],
  ): SeriesMetadata {
    return new SeriesMetadata({
      status: SeriesMetadata.Status.valueOf(self.status),
      title: self.title,
      titleSort: self.titleSort,
      summary: self.summary,
      readingDirection: self.readingDirection !== null ? SeriesMetadata.ReadingDirection.valueOf(self.readingDirection) : null,
      publisher: self.publisher,
      ageRating: self.ageRating,
      language: self.language,
      genres: genres,
      tags: tags,
      totalBookCount: self.totalBookCount,
      sharingLabels: sharingLabels,
      links: links,
      alternateTitles: alternateTitles,
      statusLock: self.statusLock,
      titleLock: self.titleLock,
      titleSortLock: self.titleSortLock,
      summaryLock: self.summaryLock,
      readingDirectionLock: self.readingDirectionLock,
      publisherLock: self.publisherLock,
      ageRatingLock: self.ageRatingLock,
      languageLock: self.languageLock,
      genresLock: self.genresLock,
      tagsLock: self.tagsLock,
      totalBookCountLock: self.totalBookCountLock,
      sharingLabelsLock: self.sharingLabelsLock,
      linksLock: self.linksLock,
      alternateTitlesLock: self.alternateTitlesLock,
      seriesId: self.seriesId,
      createdDate: toCurrentTimeZone(self.createdDate),
      lastModifiedDate: toCurrentTimeZone(self.lastModifiedDate),
    })
  }
}

component(SeriesMetadataDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
  ],
  types: [SeriesMetadataRepository],
})
