// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/KoboDtoDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ZoneId } from '@js-joda/core'
import { MediaExtensionEpub } from '../../../domain/model/MediaExtension.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { deserializeMediaExtension } from '../Utils.js'
import { ContributorDto } from '../../../interfaces/api/kobo/dto/ContributorDto.js'
import { KoboBookMetadataDto } from '../../../interfaces/api/kobo/dto/KoboBookMetadataDto.js'
import { KoboSeriesDto } from '../../../interfaces/api/kobo/dto/KoboSeriesDto.js'
import { PublisherDto } from '../../../interfaces/api/kobo/dto/PublisherDto.js'
import { KoboDtoRepository } from '../../../interfaces/api/kobo/persistence/KoboDtoRepository.js'
import { Tables } from '../../../port/jooq/generated/main/Tables.js'
import { DSLContext } from '../../../port/jooq/dsl.js'
import { ObjectMapper } from '../../../port/jackson-mapper.js'
import { component } from '../../../port/spring.js'
import { associate, groupBy, ifBlank, ifEmpty, isBlank, mapPlus } from '../../../port/kotlin.js'

export class KoboDtoDao extends SplitDslDaoBase implements KoboDtoRepository {
  private readonly b = Tables.BOOK
  private readonly m = Tables.MEDIA
  private readonly d = Tables.BOOK_METADATA
  private readonly a = Tables.BOOK_METADATA_AUTHOR
  private readonly sd = Tables.SERIES_METADATA
  private readonly bt = Tables.THUMBNAIL_BOOK
  private readonly p = Tables.BOOK_PROJECTION

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly mapper: ObjectMapper,
  ) {
    super(dslRW, dslRO)
  }

  findBookMetadataByIds(bookIds: Iterable<string>): KoboBookMetadataDto[] {
    // PORT: Collection -> Iterable, matérialisé car réutilisé par les requêtes suivantes
    const bookIds_ = [...bookIds]
    const records = this.dslRO
      .select(
        this.d.BOOK_ID,
        this.d.TITLE,
        this.d.NUMBER,
        this.d.NUMBER_SORT,
        this.d.ISBN,
        this.d.SUMMARY,
        this.d.RELEASE_DATE,
        this.d.CREATED_DATE,
        this.sd.SERIES_ID,
        this.sd.TITLE,
        this.sd.PUBLISHER,
        this.sd.LANGUAGE,
        this.b.FILE_SIZE,
        this.b.ONESHOT,
        this.m.EPUB_IS_KEPUB,
        this.m.EXTENSION_CLASS,
        this.m.EXTENSION_VALUE_BLOB,
        this.bt.ID,
      )
      .from(this.b)
      .leftJoin(this.d)
      .on(this.b.ID.eq(this.d.BOOK_ID))
      .leftJoin(this.sd)
      .on(this.b.SERIES_ID.eq(this.sd.SERIES_ID))
      .leftJoin(this.m)
      .on(this.b.ID.eq(this.m.BOOK_ID))
      .leftJoin(this.bt)
      .on(this.b.ID.eq(this.bt.BOOK_ID))
      .and(this.bt.SELECTED.isTrue())
      .where(this.d.BOOK_ID.in(bookIds_))
      .fetch()

    return records.map((rec) => {
      const br = rec.into(this.b)
      const dr = rec.into(this.d)
      const sr = rec.into(this.sd)
      const mr = rec.into(this.m)
      const btr = rec.into(this.bt)
      const mediaExtension_ = deserializeMediaExtension(this.mapper, mr.extensionClass, mr.extensionValueBlob)
      const mediaExtension = mediaExtension_ instanceof MediaExtensionEpub ? mediaExtension_ : null

      // PORT: ResultQuery itéré (records typés) -> fetchInto(a)
      const authors = groupBy(
        this.dslRO
          .selectFrom(this.a)
          .where(this.a.BOOK_ID.in(bookIds_))
          .fetchInto(this.a)
          .filter((it) => it.name !== null),
        (it) => it.bookId,
      )

      // PORT: ResultQuery itéré (records typés) -> fetchInto(p)
      const projections = groupBy(
        this.dslRO
          .selectFrom(this.p)
          .where(this.p.BOOK_ID.in(bookIds_))
          .fetchInto(this.p),
        (it) => it.bookId,
      )

      return new KoboBookMetadataDto({
        contributorRoles: (authors.get(dr.bookId) ?? []).map((it) => new ContributorDto({ name: it.name })),
        contributors: (authors.get(dr.bookId) ?? []).map((it) => it.name),
        coverImageId: btr.id,
        crossRevisionId: dr.bookId,
        // if null or empty Kobo will not update it, force it to blank
        description: ifEmpty(dr.summary, () => ' '),
        entitlementId: dr.bookId,
        isbn: isBlank(dr.isbn) ? null : dr.isbn,
        language: ifBlank(sr.language.slice(0, 2), () => 'en'),
        publicationDate: dr.releaseDate?.atStartOfDay(ZoneId.of('Z')) ?? dr.createdDate.atZone(ZoneId.of('Z')),
        publisher: new PublisherDto({ name: sr.publisher }),
        revisionId: dr.bookId,
        series: !br.oneshot
          ? new KoboSeriesDto({
              id: sr.seriesId,
              name: sr.title,
              number: dr.number,
              numberFloat: dr.numberSort,
            })
          : null,
        title: dr.title,
        workId: dr.bookId,
        isKepub: mr.epubIsKepub,
        isPrePaginated: mediaExtension?.isFixedLayout === true,
        fileSize: br.fileSize,
        extraFileSizes: mapPlus(
          associate(projections.get(dr.bookId) ?? [], (it) => [it.profile, it.fileSize]),
          [['default', br.fileSize]],
        ),
      })
    })
  }
}

component(KoboDtoDao, {
  inject: [DSLContext, { type: DSLContext, qualifier: 'dslContextRO' }, ObjectMapper],
  types: [KoboDtoRepository],
})
