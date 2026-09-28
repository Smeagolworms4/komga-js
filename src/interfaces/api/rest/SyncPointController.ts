// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/SyncPointController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { SyncPointRepository } from '../../../domain/persistence/SyncPointRepository.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import type { KomgaPrincipal } from '../../../infrastructure/security/KomgaPrincipal.js'
import { HttpStatus, MediaType, authenticationPrincipal, requestParam, restController } from '../../../port/spring-web.js'

// @RestController
// @RequestMapping("api/v1/syncpoints", produces = [MediaType.APPLICATION_JSON_VALUE])
// @Tag(name = OpenApiConfiguration.TagNames.SYNCPOINTS)
export class SyncPointController {
  constructor(private readonly syncPointRepository: SyncPointRepository) {}

  // @DeleteMapping("me")
  // @ResponseStatus(HttpStatus.NO_CONTENT)
  // @Operation(
  //   summary = "Delete all sync points",
  //   description = "If an API Key ID is passed, deletes only the sync points associated with that API Key. Deleting sync points will allow a Kobo to sync from scratch upon the next sync.",
  // )
  deleteSyncPointsForCurrentUser(
    // @AuthenticationPrincipal
    principal: KomgaPrincipal,
    // @RequestParam(required = false, name = "key_id")
    keyIds: string[] | null,
  ): void {
    if (keyIds === null || keyIds.length === 0) this.syncPointRepository.deleteByUserId(principal.user.id)
    else this.syncPointRepository.deleteByUserIdAndApiKeyIds(principal.user.id, keyIds)
  }
}

restController(SyncPointController, {
  inject: [SyncPointRepository],
  javaName: 'org.gotson.komga.interfaces.api.rest.SyncPointController',
  requestMapping: { path: ['api/v1/syncpoints'], produces: [MediaType.APPLICATION_JSON_VALUE] },
  openapi: { tags: [OpenApiConfiguration.TagNames.SYNCPOINTS] },
  handlers: {
    deleteSyncPointsForCurrentUser: {
      mapping: { method: 'DELETE', path: ['me'] },
      args: [authenticationPrincipal(), requestParam('key_id', { nullable: { list: 'String' } }, { required: false, nullable: true })],
      responseStatus: HttpStatus.NO_CONTENT,
      openapi: {
        operation: {
          summary: 'Delete all sync points',
          description:
            'If an API Key ID is passed, deletes only the sync points associated with that API Key. Deleting sync points will allow a Kobo to sync from scratch upon the next sync.',
        },
      },
    },
  },
})
