// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/main/SidecarDao.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type Sidecar, SidecarStored } from '../../../domain/model/Sidecar.js'
import { SidecarRepository } from '../../../domain/persistence/SidecarRepository.js'
import { KomgaProperties } from '../../configuration/KomgaProperties.js'
import { URL } from '../../../port/java-net.js'
import { DSL, DSLContext, transactional } from '../../../port/jooq/dsl.js'
import { type SidecarRecord, Tables } from '../../../port/jooq/generated/main/Tables.js'
import { component } from '../../../port/spring.js'
import { SplitDslDaoBase } from '../SplitDslDaoBase.js'
import { TempTable, use } from '../TempTable.js'

export class SidecarDao extends SplitDslDaoBase implements SidecarRepository {
  private readonly sc = Tables.SIDECAR

  constructor(
    dslRW: DSLContext,
    dslRO: DSLContext,
    private readonly batchSize: number,
  ) {
    super(dslRW, dslRO)
  }

  findAll(): SidecarStored[] {
    // PORT: selectFrom(sc).fetch() renvoie des SidecarRecord en jOOQ -> fetchInto(sc)
    return this.dslRO
      .selectFrom(this.sc)
      .fetchInto(this.sc)
      .map((it) => this.toDomain(it))
  }

  save(libraryId: string, sidecar: Sidecar): void {
    this.dslRW
      .insertInto(this.sc)
      .values(sidecar.url.toString(), sidecar.parentUrl.toString(), sidecar.lastModifiedTime, libraryId)
      .onDuplicateKeyUpdate()
      .set(this.sc.LAST_MODIFIED_TIME, sidecar.lastModifiedTime)
      .set(this.sc.PARENT_URL, sidecar.parentUrl.toString())
      .set(this.sc.LIBRARY_ID, libraryId)
      .execute()
  }

  // @Transactional
  deleteByLibraryIdAndUrls(libraryId: string, urls: Iterable<URL>): void {
    transactional(this.dslRW.db, () => {
      use(
        TempTable.withTempTable(
          this.dslRW,
          this.batchSize,
          [...urls].map((it) => it.toString()),
        ),
        (it) => {
          this.dslRW.deleteFrom(this.sc).where(this.sc.LIBRARY_ID.eq(libraryId)).and(this.sc.URL.in(it.selectTempStrings())).execute()
        },
      )
    })
  }

  deleteByLibraryId(libraryId: string): void {
    this.dslRW.deleteFrom(this.sc).where(this.sc.LIBRARY_ID.eq(libraryId)).execute()
  }

  countGroupedByLibraryId(): Map<string, number> {
    return this.dslRO
      .select(this.sc.LIBRARY_ID, DSL.count(this.sc.URL))
      .from(this.sc)
      .groupBy(this.sc.LIBRARY_ID)
      .fetchMap(this.sc.LIBRARY_ID, DSL.count(this.sc.URL))
  }

  private toDomain(self: SidecarRecord): SidecarStored {
    return new SidecarStored({
      url: new URL(self.url),
      parentUrl: new URL(self.parentUrl),
      lastModifiedTime: self.lastModifiedTime,
      libraryId: self.libraryId,
    })
  }
}

component(SidecarDao, {
  inject: [
    DSLContext,
    { type: DSLContext, qualifier: 'dslContextRO' },
    { expression: (ctx) => ctx.getBean(KomgaProperties).database.batchChunkSize },
  ],
  types: [SidecarRepository],
})
