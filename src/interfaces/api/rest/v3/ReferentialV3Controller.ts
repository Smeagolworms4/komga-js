// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/v3/ReferentialV3Controller.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { PageResponse } from '../../../../application/query/PageResponse.js'
import { toPageResponse } from '../../../../application/query/PageResult.js'
import { unpackFilters } from '../../../../domain/model/FilterBy.js'
import { SearchContext } from '../../../../domain/model/SearchContext.js'
import { ReferentialRepository } from '../../../../domain/persistence/ReferentialRepository.js'
import { OpenApiConfiguration } from '../../../../infrastructure/openapi/OpenApiConfiguration.js'
import { PageableWithoutSortAsQueryParam } from '../../../../infrastructure/openapi/PageableAnnotations.js'
import type { KomgaPrincipal } from '../../../../infrastructure/security/KomgaPrincipal.js'
import type { Pageable } from '../../../../port/spring-data.js'
import { MediaType, authenticationPrincipal, pageable, requestParam, restController, withParameter } from '../../../../port/spring-web.js'
import { unpackPageParams } from '../../Utils.js'
import { NotableEntityDto, toDto } from '../dto/NotableEntityDto.js'

// @RestController
// @RequestMapping("api/v3", produces = [MediaType.APPLICATION_JSON_VALUE])
// @Tag(name = OpenApiConfiguration.TagNames.REFERENTIAL)
export class ReferentialV3Controller {
  constructor(private readonly referentialRepository: ReferentialRepository) {}

  // @PageableWithoutSortAsQueryParam
  // @GetMapping("notable-entities")
  // @Operation(summary = "List notable entities", description = "Can be filtered by various criteria")
  getNotableEntities(
    principal: KomgaPrincipal,
    search: string | null,
    kind: string | null,
    libraryIds: ReadonlySet<string> = new Set(),
    collectionIds: ReadonlySet<string> = new Set(),
    seriesIds: ReadonlySet<string> = new Set(),
    readListIds: ReadonlySet<string> = new Set(),
    unpaged: boolean = false,
    page: Pageable,
  ): PageResponse<NotableEntityDto> {
    const pageRequest = unpackPageParams(unpaged, page)
    const filterBy = unpackFilters({ libraryIds, collectionIds, seriesIds, readListIds })

    return toPageResponse(this.referentialRepository.findNotableEntities(new SearchContext(principal.user), search, kind, filterBy, pageRequest), pageRequest, (it) => toDto(it))
  }

  // @PageableWithoutSortAsQueryParam
  // @GetMapping("notable-entities/kinds")
  // @Operation(summary = "List notable entities kinds", description = "Can be filtered by various criteria")
  getNotableEntitiesKinds(
    principal: KomgaPrincipal,
    libraryIds: ReadonlySet<string> = new Set(),
    collectionIds: ReadonlySet<string> = new Set(),
    seriesIds: ReadonlySet<string> = new Set(),
    readListIds: ReadonlySet<string> = new Set(),
    unpaged: boolean = false,
    page: Pageable,
  ): PageResponse<string> {
    const pageRequest = unpackPageParams(unpaged, page)
    const filterBy = unpackFilters({ libraryIds, collectionIds, seriesIds, readListIds })

    return toPageResponse(this.referentialRepository.findNotableEntitiesKinds(new SearchContext(principal.user), filterBy, pageRequest), pageRequest)
  }

  // @PageableWithoutSortAsQueryParam
  // @GetMapping("notable-entities/names")
  // @Operation(summary = "List notable entities names", description = "Can be filtered by various criteria")
  getNotableEntitiesNames(
    principal: KomgaPrincipal,
    search: string | null,
    kind: string | null,
    libraryIds: ReadonlySet<string> = new Set(),
    collectionIds: ReadonlySet<string> = new Set(),
    seriesIds: ReadonlySet<string> = new Set(),
    readListIds: ReadonlySet<string> = new Set(),
    unpaged: boolean = false,
    page: Pageable,
  ): PageResponse<string> {
    const pageRequest = unpackPageParams(unpaged, page)
    const filterBy = unpackFilters({ libraryIds, collectionIds, seriesIds, readListIds })

    return toPageResponse(this.referentialRepository.findNotableEntitiesNames(new SearchContext(principal.user), search, kind, filterBy, pageRequest), pageRequest)
  }
}

// `@RequestParam(name = ..., required = false) x: Set<String> = emptySet()`
const setParam = (name: string) => requestParam(name, { set: 'String' }, { required: false, hasDefault: true })
// `@RequestParam(name = ..., required = false) x: String?`
const nullableString = (name: string) => requestParam(name, { nullable: 'String' }, { required: false, nullable: true })
const unpagedParam = () => requestParam('unpaged', 'Boolean', { required: false, hasDefault: true })
const filterParams = () => [setParam('library_id'), setParam('collection_id'), setParam('series_id'), setParam('readlist_id'), unpagedParam(), withParameter(pageable(), { hidden: true })]

// PORT: annotations Spring (@RestController, @RequestMapping, @GetMapping, @RequestParam)
restController(ReferentialV3Controller, {
  inject: [ReferentialRepository],
  javaName: 'org.gotson.komga.interfaces.api.rest.v3.ReferentialV3Controller',
  requestMapping: { path: ['api/v3'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  openapi: { tags: [OpenApiConfiguration.TagNames.REFERENTIAL] },
  handlers: {
    getNotableEntities: {
      mapping: { method: 'GET', path: ['notable-entities'] },
      args: [authenticationPrincipal(), nullableString('search'), nullableString('kind'), ...filterParams()],
      returns: { class: PageResponse, args: [{ class: NotableEntityDto }] },
      openapi: { operation: { summary: 'List notable entities', description: 'Can be filtered by various criteria' }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getNotableEntitiesKinds: {
      mapping: { method: 'GET', path: ['notable-entities/kinds'] },
      args: [authenticationPrincipal(), ...filterParams()],
      returns: { class: PageResponse, args: ['String'] },
      openapi: { operation: { summary: 'List notable entities kinds', description: 'Can be filtered by various criteria' }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
    getNotableEntitiesNames: {
      mapping: { method: 'GET', path: ['notable-entities/names'] },
      args: [authenticationPrincipal(), nullableString('search'), nullableString('kind'), ...filterParams()],
      returns: { class: PageResponse, args: ['String'] },
      openapi: { operation: { summary: 'List notable entities names', description: 'Can be filtered by various criteria' }, parameters: [...PageableWithoutSortAsQueryParam] },
    },
  },
})
