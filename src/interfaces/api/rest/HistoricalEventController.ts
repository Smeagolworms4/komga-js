// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/HistoricalEventController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { PageableAsQueryParam } from '../../../infrastructure/openapi/PageableAnnotations.js'
import { Order, type Page, PageImpl, PageRequest, type Pageable, Sort } from '../../../port/spring-data.js'
import { MediaType, pageable, restController, withParameter } from '../../../port/spring-web.js'
import { HistoricalEventDtoRepository } from '../persistence/HistoricalEventDtoRepository.js'
import { HistoricalEventDto } from './dto/HistoricalEventDto.js'

// @RestController
// @RequestMapping("api/v1/history", produces = [MediaType.APPLICATION_JSON_VALUE])
// @PreAuthorize("hasRole('ADMIN')")
// @Tag(name = OpenApiConfiguration.TagNames.HISTORY)
export class HistoricalEventController {
  constructor(private readonly historicalEventDtoRepository: HistoricalEventDtoRepository) {}

  // @GetMapping
  // @PageableAsQueryParam
  // @Operation(summary = "List historical events")
  getHistoricalEvents(
    // @Parameter(hidden = true)
    page: Pageable,
  ): Page<HistoricalEventDto> {
    const sort = page.sort.isSorted ? page.sort : Sort.by(Order.desc('timestamp'))

    const pageRequest = PageRequest.of(page.pageNumber, page.pageSize, sort)

    return this.historicalEventDtoRepository.findAll(pageRequest)
  }
}

restController(HistoricalEventController, {
  inject: [HistoricalEventDtoRepository],
  javaName: 'org.gotson.komga.interfaces.api.rest.HistoricalEventController',
  requestMapping: { path: ['api/v1/history'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  preAuthorize: "hasRole('ADMIN')",
  openapi: { tags: [OpenApiConfiguration.TagNames.HISTORY] },
  handlers: {
    getHistoricalEvents: {
      mapping: { method: 'GET' },
      args: [withParameter(pageable(), { hidden: true })],
      returns: { class: PageImpl, args: [{ class: HistoricalEventDto }] },
      openapi: { operation: { summary: 'List historical events' }, parameters: [...PageableAsQueryParam] },
    },
  },
})
