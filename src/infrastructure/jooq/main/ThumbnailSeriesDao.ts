// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/ThumbnailSeriesDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Dimension } from '../../../domain/model/Dimension.js'
import { ThumbnailSeries } from '../../../domain/model/ThumbnailSeries.js'
import { ThumbnailSeriesRepository } from '../../../domain/persistence/ThumbnailSeriesRepository.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'
import { Tables, type ThumbnailSeriesRecord } from '../../../port/jooq/generated/main/Tables.js'
import { DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { component } from '../../../port/spring.js'
import { URL } from '../../../port/java-net.js'
import { firstOrNull } from '../../../port/kotlin.js'

export class ThumbnailSeriesDao extends SplitDslDaoBase implements ThumbnailSeriesRepository {
  private readonly ts = Tables.THUMBNAIL_SERIES
  private readonly s = Tables.SERIES

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly batchSize: number,
  ) {
    super(dslRW, dslRO)
  }

  findByIdOrNull(thumbnailId: string): ThumbnailSeries | null {
    const r = this.dslRO.selectFrom(this.ts).where(this.ts.ID.eq(thumbnailId)).fetchOneInto(this.ts)
    return r !== null ? this.toDomain(r) : null
  }

  findAllBySeriesId(seriesId: string): ThumbnailSeries[] {
    return this.dslRO
      .selectFrom(this.ts)
      .where(this.ts.SERIES_ID.eq(seriesId))
      .fetchInto(this.ts)
      .map((it) => this.toDomain(it))
  }

  findAllBySeriesIdIdAndType(seriesId: string, type: ThumbnailSeries.Type): ThumbnailSeries[] {
    return this.dslRO
      .selectFrom(this.ts)
      .where(this.ts.SERIES_ID.eq(seriesId))
      .and(this.ts.TYPE.eq(type.toString()))
      .fetchInto(this.ts)
      .map((it) => this.toDomain(it))
  }

  getLibraryIdOrNull(thumbnailId: string): string | null {
    return this.dslRO
      .select(this.s.LIBRARY_ID)
      .from(this.ts)
      .leftJoin(this.s)
      .on(this.ts.SERIES_ID.eq(this.s.ID))
      .where(this.ts.ID.eq(thumbnailId))
      .fetchOne(this.s.LIBRARY_ID)
  }

  getSeriesIdOrNull(thumbnailId: string): string | null {
    return this.dslRO
      .select(this.ts.SERIES_ID)
      .from(this.ts)
      .where(this.ts.ID.eq(thumbnailId))
      .fetchOne(this.ts.SERIES_ID)
  }

  findSelectedBySeriesIdOrNull(seriesId: string): ThumbnailSeries | null {
    return firstOrNull(
      this.dslRO
        .selectFrom(this.ts)
        .where(this.ts.SERIES_ID.eq(seriesId))
        .and(this.ts.SELECTED.isTrue())
        .limit(1)
        .fetchInto(this.ts)
        .map((it) => this.toDomain(it)),
    )
  }

  insert(thumbnail: ThumbnailSeries): void {
    this.dslRW
      .insertInto(this.ts)
      .set(this.ts.ID, thumbnail.id)
      .set(this.ts.SERIES_ID, thumbnail.seriesId)
      .set(this.ts.URL, thumbnail.url !== null ? thumbnail.url.toString() : null)
      .set(this.ts.THUMBNAIL, thumbnail.thumbnail)
      .set(this.ts.TYPE, thumbnail.type.toString())
      .set(this.ts.MEDIA_TYPE, thumbnail.mediaType)
      .set(this.ts.WIDTH, thumbnail.dimension.width)
      .set(this.ts.HEIGHT, thumbnail.dimension.height)
      .set(this.ts.FILE_SIZE, thumbnail.fileSize)
      .set(this.ts.SELECTED, thumbnail.selected)
      .execute()
  }

  update(thumbnail: ThumbnailSeries): void {
    this.dslRW
      .update(this.ts)
      .set(this.ts.SERIES_ID, thumbnail.seriesId)
      .set(this.ts.THUMBNAIL, thumbnail.thumbnail)
      .set(this.ts.URL, thumbnail.url !== null ? thumbnail.url.toString() : null)
      .set(this.ts.SELECTED, thumbnail.selected)
      .set(this.ts.TYPE, thumbnail.type.toString())
      .set(this.ts.MEDIA_TYPE, thumbnail.mediaType)
      .set(this.ts.WIDTH, thumbnail.dimension.width)
      .set(this.ts.HEIGHT, thumbnail.dimension.height)
      .set(this.ts.FILE_SIZE, thumbnail.fileSize)
      .where(this.ts.ID.eq(thumbnail.id))
      .execute()
  }

  // @Transactional
  markSelected(thumbnail: ThumbnailSeries): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .update(this.ts)
        .set(this.ts.SELECTED, false)
        .where(this.ts.SERIES_ID.eq(thumbnail.seriesId))
        .and(this.ts.ID.ne(thumbnail.id))
        .execute()

      this.dslRW
        .update(this.ts)
        .set(this.ts.SELECTED, true)
        .where(this.ts.SERIES_ID.eq(thumbnail.seriesId))
        .and(this.ts.ID.eq(thumbnail.id))
        .execute()
    })
  }

  delete(thumbnailSeriesId: string): void {
    this.dslRW.deleteFrom(this.ts).where(this.ts.ID.eq(thumbnailSeriesId)).execute()
  }

  deleteBySeriesId(seriesId: string): void {
    this.dslRW.deleteFrom(this.ts).where(this.ts.SERIES_ID.eq(seriesId)).execute()
  }

  // @Transactional
  deleteBySeriesIds(seriesIds: Iterable<string>): void {
    transactional(this.dslRW.db, () => {
      use(TempTable.withTempTable(this.dslRW, this.batchSize, seriesIds), (it) => {
        this.dslRW.deleteFrom(this.ts).where(this.ts.SERIES_ID.in(it.selectTempStrings())).execute()
      })
    })
  }

  private toDomain(self: ThumbnailSeriesRecord): ThumbnailSeries {
    return new ThumbnailSeries({
      thumbnail: self.thumbnail,
      url: self.url !== null ? new URL(self.url) : null,
      selected: self.selected,
      type: ThumbnailSeries.Type.valueOf(self.type),
      mediaType: self.mediaType,
      fileSize: self.fileSize,
      dimension: new Dimension({ width: self.width, height: self.height }),
      id: self.id,
      seriesId: self.seriesId,
      createdDate: self.createdDate,
      lastModifiedDate: self.lastModifiedDate,
    })
  }
}

component(ThumbnailSeriesDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
  ],
  types: [ThumbnailSeriesRepository],
})
