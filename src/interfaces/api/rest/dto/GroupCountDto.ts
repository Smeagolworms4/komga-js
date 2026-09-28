// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/GroupCountDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type GroupCountDtoParams = {
  group: string
  count: number
}

export class GroupCountDto extends DataClass<GroupCountDtoParams> {
  readonly group: string
  readonly count: number

  constructor({ group, count }: GroupCountDtoParams) {
    super()
    this.group = group
    this.count = count
  }
}

jsonProperties(GroupCountDto, { group: 'String', count: 'Int' }, [], { required: ['group', 'count'] })
