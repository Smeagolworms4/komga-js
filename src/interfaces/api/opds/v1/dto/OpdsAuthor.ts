// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/opds/v1/dto/OpdsAuthor.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../../port/jackson.js'
import { JsonTypes, jsonProperties } from '../../../../../port/jackson-mapper.js'
import { jacksonXml } from '../../../../../port/jackson-xml.js'
import type { URI } from '../../../../../port/java-net.js'
import { DataClass } from '../../../../../port/kotlin.js'
import { ATOM } from './XmlNamespaces.js'

type OpdsAuthorParams = {
  name: string
  uri?: URI | null
}

export class OpdsAuthor extends DataClass<OpdsAuthorParams> {
  // @JacksonXmlProperty(namespace = ATOM)
  readonly name: string
  // @JsonInclude(JsonInclude.Include.NON_NULL)
  // @JacksonXmlProperty(namespace = ATOM)
  readonly uri: URI | null

  constructor({ name, uri = null }: OpdsAuthorParams) {
    super()
    this.name = name
    this.uri = uri
  }
}

json(OpdsAuthor, { propertyInclude: { uri: 'NON_NULL' } })
jacksonXml(OpdsAuthor, { namespace: { name: ATOM, uri: ATOM } })
jsonProperties(OpdsAuthor, { name: 'String', uri: { nullable: JsonTypes.URI } }, [], { required: ['name'] })
