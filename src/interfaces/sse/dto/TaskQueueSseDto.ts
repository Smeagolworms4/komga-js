// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/sse/dto/TaskQueueSseDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../port/jackson-mapper.js'
import { DataClass } from '../../../port/kotlin.js'

type TaskQueueSseDtoParams = {
  count: number
  countByType: Map<string, number>
}

export class TaskQueueSseDto extends DataClass<TaskQueueSseDtoParams> {
  readonly count: number
  readonly countByType: Map<string, number>

  constructor({ count, countByType }: TaskQueueSseDtoParams) {
    super()
    this.count = count
    this.countByType = countByType
  }
}

jsonProperties(TaskQueueSseDto, { count: 'Int', countByType: { map: 'Int', key: 'String' } }, [], { required: ['count', 'countByType'] })
