// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/opds/v1/dto/OpenSearchDescription.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { jsonProperties } from '../../../../../port/jackson-mapper.js'
import { jacksonXml } from '../../../../../port/jackson-xml.js'
import { Size, constraints } from '../../../../../port/validation.js'
import { OPENSEARCH } from './XmlNamespaces.js'

type OpenSearchDescriptionParams = {
  shortName: string
  description: string
  inputEncoding?: string
  outputEncoding?: string
  url: OpenSearchDescription.OpenSearchUrl
}

// @JacksonXmlRootElement(localName = "OpenSearchDescription", namespace = OPENSEARCH)
// PORT: paramètres du constructeur nommés (objet)
export class OpenSearchDescription {
  // @JacksonXmlProperty(localName = "ShortName", namespace = OPENSEARCH)
  // @Size(min = 1, max = 16)
  readonly shortName: string
  // @JacksonXmlProperty(localName = "Description", namespace = OPENSEARCH)
  // @Size(min = 1, max = 1024)
  readonly description: string
  // @JacksonXmlProperty(localName = "InputEncoding", namespace = OPENSEARCH)
  readonly inputEncoding: string
  // @JacksonXmlProperty(localName = "OutputEncoding", namespace = OPENSEARCH)
  readonly outputEncoding: string
  // @JacksonXmlProperty(localName = "Url", namespace = OPENSEARCH)
  readonly url: OpenSearchDescription.OpenSearchUrl

  constructor({ shortName, description, inputEncoding = 'UTF-8', outputEncoding = 'UTF-8', url }: OpenSearchDescriptionParams) {
    this.shortName = shortName
    this.description = description
    this.inputEncoding = inputEncoding
    this.outputEncoding = outputEncoding
    this.url = url
  }
}

export namespace OpenSearchDescription {
  export class OpenSearchUrl {
    // @JacksonXmlProperty(isAttribute = true)
    readonly template: string

    // @JacksonXmlProperty(isAttribute = true)
    readonly type = 'application/atom+xml;profile=opds-catalog;kind=acquisition'

    constructor({ template }: { template: string }) {
      this.template = template
    }
  }
}

jacksonXml(OpenSearchDescription, {
  rootElement: 'OpenSearchDescription',
  rootNamespace: OPENSEARCH,
  localName: { shortName: 'ShortName', description: 'Description', inputEncoding: 'InputEncoding', outputEncoding: 'OutputEncoding', url: 'Url' },
  namespace: { shortName: OPENSEARCH, description: OPENSEARCH, inputEncoding: OPENSEARCH, outputEncoding: OPENSEARCH, url: OPENSEARCH },
})
jsonProperties(OpenSearchDescription, {
  shortName: 'String',
  description: 'String',
  inputEncoding: 'String',
  outputEncoding: 'String',
  url: { class: OpenSearchDescription.OpenSearchUrl },
})
constraints(OpenSearchDescription, { shortName: [Size({ min: 1, max: 16 })], description: [Size({ min: 1, max: 1024 })] })
jacksonXml(OpenSearchDescription.OpenSearchUrl, { isAttribute: ['template', 'type'] })
jsonProperties(OpenSearchDescription.OpenSearchUrl, { template: 'String' })
