// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/xml/NamespaceXmlFactory.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { JsonProcessingException } from '../../port/jackson-mapper.js'
import { XmlFactory, XMLStreamException, type XMLStreamWriter } from '../../port/jackson-xml.js'

// PORT: les surcharges _createXmlWriter(ctxt, w) et createGenerator(out|writer|file|sw) de Jackson XML
// convergent vers XmlFactory.createXmlWriter(w) de port/jackson-xml.ts : une seule redéfinition
export class NamespaceXmlFactory extends XmlFactory {
  private readonly defaultNamespace: string | null
  private readonly prefixToNamespace: Map<string, string>

  constructor({ defaultNamespace = null, prefixToNamespace = new Map() }: { defaultNamespace?: string | null; prefixToNamespace?: Map<string, string> } = {}) {
    super()
    this.defaultNamespace = defaultNamespace
    this.prefixToNamespace = prefixToNamespace
  }

  override createXmlWriter<W extends XMLStreamWriter>(w: W): W {
    const it = super.createXmlWriter(w)
    this.configure(it)
    return it
  }

  private configure(self: XMLStreamWriter): void {
    try {
      if (this.defaultNamespace !== null) self.setDefaultNamespace(this.defaultNamespace)
      for (const [key, value] of this.prefixToNamespace) {
        self.setPrefix(key, value)
      }
    } catch (e) {
      if (!(e instanceof XMLStreamException)) throw e
      // PORT: StaxUtil.throwAsGenerationException(e, null) -> JsonProcessingException (JsonGenerationException)
      throw new JsonProcessingException(e.message, e)
    }
  }
}
