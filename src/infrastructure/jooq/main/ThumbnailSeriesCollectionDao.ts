// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/ThumbnailSeriesCollectionDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Dimension } from '../../../domain/model/Dimension.js'
import { ThumbnailSeriesCollection } from '../../../domain/model/ThumbnailSeriesCollection.js'
import { ThumbnailSeriesCollectionRepository } from '../../../domain/persistence/ThumbnailSeriesCollectionRepository.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { Tables, type ThumbnailCollectionRecord } from '../../../port/jooq/generated/main/Tables.js'
import { DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { component } from '../../../port/spring.js'
import { firstOrNull } from '../../../port/kotlin.js'

export class ThumbnailSeriesCollectionDao extends SplitDslDaoBase implements ThumbnailSeriesCollectionRepository {
  private readonly tc = Tables.THUMBNAIL_COLLECTION

  constructor(dslRW: DSLContext, dslRO: DSLContext) {
    super(dslRW, dslRO)
  }

  findByIdOrNull(thumbnailId: string): ThumbnailSeriesCollection | null {
    const r = this.dslRO.selectFrom(this.tc).where(this.tc.ID.eq(thumbnailId)).fetchOneInto(this.tc)
    return r !== null ? this.toDomain(r) : null
  }

  findSelectedByCollectionIdOrNull(collectionId: string): ThumbnailSeriesCollection | null {
    return firstOrNull(
      this.dslRO
        .selectFrom(this.tc)
        .where(this.tc.COLLECTION_ID.eq(collectionId))
        .and(this.tc.SELECTED.isTrue())
        .limit(1)
        .fetchInto(this.tc)
        .map((it) => this.toDomain(it)),
    )
  }

  findAllByCollectionId(collectionId: string): ThumbnailSeriesCollection[] {
    return this.dslRO
      .selectFrom(this.tc)
      .where(this.tc.COLLECTION_ID.eq(collectionId))
      .fetchInto(this.tc)
      .map((it) => this.toDomain(it))
  }

  insert(thumbnail: ThumbnailSeriesCollection): void {
    this.dslRW
      .insertInto(this.tc)
      .set(this.tc.ID, thumbnail.id)
      .set(this.tc.COLLECTION_ID, thumbnail.collectionId)
      .set(this.tc.THUMBNAIL, thumbnail.thumbnail)
      .set(this.tc.SELECTED, thumbnail.selected)
      .set(this.tc.TYPE, thumbnail.type.toString())
      .set(this.tc.MEDIA_TYPE, thumbnail.mediaType)
      .set(this.tc.WIDTH, thumbnail.dimension.width)
      .set(this.tc.HEIGHT, thumbnail.dimension.height)
      .set(this.tc.FILE_SIZE, thumbnail.fileSize)
      .execute()
  }

  update(thumbnail: ThumbnailSeriesCollection): void {
    this.dslRW
      .update(this.tc)
      .set(this.tc.COLLECTION_ID, thumbnail.collectionId)
      .set(this.tc.THUMBNAIL, thumbnail.thumbnail)
      .set(this.tc.SELECTED, thumbnail.selected)
      .set(this.tc.TYPE, thumbnail.type.toString())
      .set(this.tc.MEDIA_TYPE, thumbnail.mediaType)
      .set(this.tc.WIDTH, thumbnail.dimension.width)
      .set(this.tc.HEIGHT, thumbnail.dimension.height)
      .set(this.tc.FILE_SIZE, thumbnail.fileSize)
      .where(this.tc.ID.eq(thumbnail.id))
      .execute()
  }

  // @Transactional
  markSelected(thumbnail: ThumbnailSeriesCollection): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .update(this.tc)
        .set(this.tc.SELECTED, false)
        .where(this.tc.COLLECTION_ID.eq(thumbnail.collectionId))
        .and(this.tc.ID.ne(thumbnail.id))
        .execute()

      this.dslRW
        .update(this.tc)
        .set(this.tc.SELECTED, true)
        .where(this.tc.COLLECTION_ID.eq(thumbnail.collectionId))
        .and(this.tc.ID.eq(thumbnail.id))
        .execute()
    })
  }

  delete(thumbnailCollectionId: string): void {
    this.dslRW.deleteFrom(this.tc).where(this.tc.ID.eq(thumbnailCollectionId)).execute()
  }

  deleteByCollectionId(collectionId: string): void {
    this.dslRW.deleteFrom(this.tc).where(this.tc.COLLECTION_ID.eq(collectionId)).execute()
  }

  deleteByCollectionIds(collectionIds: Iterable<string>): void {
    this.dslRW.deleteFrom(this.tc).where(this.tc.COLLECTION_ID.in(collectionIds)).execute()
  }

  private toDomain(self: ThumbnailCollectionRecord): ThumbnailSeriesCollection {
    return new ThumbnailSeriesCollection({
      thumbnail: self.thumbnail,
      selected: self.selected,
      type: ThumbnailSeriesCollection.Type.valueOf(self.type),
      mediaType: self.mediaType,
      fileSize: self.fileSize,
      dimension: new Dimension({ width: self.width, height: self.height }),
      id: self.id,
      collectionId: self.collectionId,
      createdDate: self.createdDate,
      lastModifiedDate: self.lastModifiedDate,
    })
  }
}

component(ThumbnailSeriesCollectionDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }],
  types: [ThumbnailSeriesCollectionRepository],
})
