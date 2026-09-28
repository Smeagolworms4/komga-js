// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/ResourcesDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { JsonNode } from '../../../../port/jackson-tree.js'
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type ResourcesDtoParams = {
  resources: JsonNode
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class ResourcesDto extends DataClass<ResourcesDtoParams> {
  readonly resources: JsonNode

  constructor({ resources }: ResourcesDtoParams) {
    super()
    this.resources = resources
  }
}

// PORT: JsonNode -> 'Any' (à la lecture, l'arbre est converti en valeurs JS : Map, nombres, chaînes)
// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(ResourcesDto, { rename: { resources: 'Resources' } })
jsonProperties(
  ResourcesDto,
  {
    resources: 'Any',
  },
  [],
  { required: ['resources'] },
)
