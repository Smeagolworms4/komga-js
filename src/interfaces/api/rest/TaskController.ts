// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/TaskController.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { TasksRepository } from '../../../application/tasks/TasksRepository.js'
import { OpenApiConfiguration } from '../../../infrastructure/openapi/OpenApiConfiguration.js'
import { HttpStatus, MediaType, restController } from '../../../port/spring-web.js'

// @RestController
// @RequestMapping(produces = [MediaType.APPLICATION_JSON_VALUE])
// @Tag(name = OpenApiConfiguration.TagNames.TASKS)
export class TaskController {
  constructor(private readonly tasksRepository: TasksRepository) {}

  // @DeleteMapping("api/v1/tasks")
  // @ResponseStatus(HttpStatus.OK)
  // @PreAuthorize("hasRole('ADMIN')")
  // @Operation(summary = "Clear task queue", description = "Cancel all tasks queued")
  emptyTaskQueue(): number {
    return this.tasksRepository.deleteAllWithoutOwner()
  }
}

restController(TaskController, {
  inject: [TasksRepository],
  javaName: 'org.gotson.komga.interfaces.api.rest.TaskController',
  requestMapping: { produces: [MediaType.APPLICATION_JSON_VALUE] },
  openapi: { tags: [OpenApiConfiguration.TagNames.TASKS] },
  handlers: {
    emptyTaskQueue: {
      mapping: { method: 'DELETE', path: ['api/v1/tasks'] },
      responseStatus: HttpStatus.OK,
      preAuthorize: "hasRole('ADMIN')",
      returns: 'Int',
      openapi: { operation: { summary: 'Clear task queue', description: 'Cancel all tasks queued' } },
    },
  },
})
