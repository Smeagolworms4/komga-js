// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/comicrack/dto/ReadingList.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { jacksonXml } from '../../../../port/jackson-xml.js'
import { str } from '../../../../port/kotlin.js'
import { Book } from './Book.js'

// @JsonIgnoreProperties(ignoreUnknown = true)
export class ReadingList {
  // @JsonProperty(value = "Name")
  name: string | null = null

  // @JacksonXmlElementWrapper(useWrapping = true)
  // @JacksonXmlProperty(localName = "Books")
  // @JsonSetter(nulls = Nulls.AS_EMPTY)
  books: Book[] = []

  toString(): string {
    return `ReadingList(name=${str(this.name)}, books=${str(this.books)})`
  }
}

jsonProperties(ReadingList, {
  name: { nullable: 'String' },
  books: { list: { class: Book } },
})
json(ReadingList, { ignoreUnknown: true, rename: { name: 'Name' }, nullsAsEmpty: ['books'] })
jacksonXml(ReadingList, { localName: { books: 'Books' }, wrapper: { books: { useWrapping: true } } })
