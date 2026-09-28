// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/ThumbnailReadListDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Dimension } from '../../../domain/model/Dimension.js'
import { ThumbnailReadList } from '../../../domain/model/ThumbnailReadList.js'
import { ThumbnailReadListRepository } from '../../../domain/persistence/ThumbnailReadListRepository.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { Tables, type ThumbnailReadlistRecord } from '../../../port/jooq/generated/main/Tables.js'
import { DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { component } from '../../../port/spring.js'
import { firstOrNull } from '../../../port/kotlin.js'

export class ThumbnailReadListDao extends SplitDslDaoBase implements ThumbnailReadListRepository {
  private readonly tr = Tables.THUMBNAIL_READLIST

  constructor(dslRW: DSLContext, dslRO: DSLContext) {
    super(dslRW, dslRO)
  }

  findAllByReadListId(readListId: string): ThumbnailReadList[] {
    return this.dslRO
      .selectFrom(this.tr)
      .where(this.tr.READLIST_ID.eq(readListId))
      .fetchInto(this.tr)
      .map((it) => this.toDomain(it))
  }

  findByIdOrNull(thumbnailId: string): ThumbnailReadList | null {
    const r = this.dslRO.selectFrom(this.tr).where(this.tr.ID.eq(thumbnailId)).fetchOneInto(this.tr)
    return r !== null ? this.toDomain(r) : null
  }

  findSelectedByReadListIdOrNull(readListId: string): ThumbnailReadList | null {
    return firstOrNull(
      this.dslRO
        .selectFrom(this.tr)
        .where(this.tr.READLIST_ID.eq(readListId))
        .and(this.tr.SELECTED.isTrue())
        .limit(1)
        .fetchInto(this.tr)
        .map((it) => this.toDomain(it)),
    )
  }

  insert(thumbnail: ThumbnailReadList): void {
    this.dslRW
      .insertInto(this.tr)
      .set(this.tr.ID, thumbnail.id)
      .set(this.tr.READLIST_ID, thumbnail.readListId)
      .set(this.tr.THUMBNAIL, thumbnail.thumbnail)
      .set(this.tr.SELECTED, thumbnail.selected)
      .set(this.tr.TYPE, thumbnail.type.toString())
      .set(this.tr.MEDIA_TYPE, thumbnail.mediaType)
      .set(this.tr.WIDTH, thumbnail.dimension.width)
      .set(this.tr.HEIGHT, thumbnail.dimension.height)
      .set(this.tr.FILE_SIZE, thumbnail.fileSize)
      .execute()
  }

  update(thumbnail: ThumbnailReadList): void {
    this.dslRW
      .update(this.tr)
      .set(this.tr.READLIST_ID, thumbnail.readListId)
      .set(this.tr.THUMBNAIL, thumbnail.thumbnail)
      .set(this.tr.SELECTED, thumbnail.selected)
      .set(this.tr.TYPE, thumbnail.type.toString())
      .set(this.tr.MEDIA_TYPE, thumbnail.mediaType)
      .set(this.tr.WIDTH, thumbnail.dimension.width)
      .set(this.tr.HEIGHT, thumbnail.dimension.height)
      .set(this.tr.FILE_SIZE, thumbnail.fileSize)
      .where(this.tr.ID.eq(thumbnail.id))
      .execute()
  }

  // @Transactional
  markSelected(thumbnail: ThumbnailReadList): void {
    transactional(this.dslRW.db, () => {
      this.dslRW
        .update(this.tr)
        .set(this.tr.SELECTED, false)
        .where(this.tr.READLIST_ID.eq(thumbnail.readListId))
        .and(this.tr.ID.ne(thumbnail.id))
        .execute()

      this.dslRW
        .update(this.tr)
        .set(this.tr.SELECTED, true)
        .where(this.tr.READLIST_ID.eq(thumbnail.readListId))
        .and(this.tr.ID.eq(thumbnail.id))
        .execute()
    })
  }

  delete(thumbnailReadListId: string): void {
    this.dslRW.deleteFrom(this.tr).where(this.tr.ID.eq(thumbnailReadListId)).execute()
  }

  deleteByReadListId(readListId: string): void {
    this.dslRW.deleteFrom(this.tr).where(this.tr.READLIST_ID.eq(readListId)).execute()
  }

  deleteByReadListIds(readListIds: Iterable<string>): void {
    this.dslRW.deleteFrom(this.tr).where(this.tr.READLIST_ID.in(readListIds)).execute()
  }

  private toDomain(self: ThumbnailReadlistRecord): ThumbnailReadList {
    return new ThumbnailReadList({
      thumbnail: self.thumbnail,
      selected: self.selected,
      type: ThumbnailReadList.Type.valueOf(self.type),
      mediaType: self.mediaType,
      fileSize: self.fileSize,
      dimension: new Dimension({ width: self.width, height: self.height }),
      id: self.id,
      readListId: self.readlistId,
      createdDate: self.createdDate,
      lastModifiedDate: self.lastModifiedDate,
    })
  }
}

component(ThumbnailReadListDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }],
  types: [ThumbnailReadListRepository],
})
