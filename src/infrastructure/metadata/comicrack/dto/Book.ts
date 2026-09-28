// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/metadata/comicrack/dto/Book.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { str } from '../../../../port/kotlin.js'

// @JsonIgnoreProperties(ignoreUnknown = true)
export class Book {
  // @JsonProperty(value = "Series")
  series: string | null = null

  // @JsonProperty(value = "Number")
  number: string | null = null

  // @JsonProperty(value = "Volume")
  volume: number | null = null

  // @JsonProperty(value = "Year")
  year: number | null = null

  // @JsonProperty(value = "FileName")
  fileName: string | null = null

  toString(): string {
    return `Book(series=${str(this.series)}, number=${str(this.number)}, volume=${str(this.volume)}, year=${str(this.year)}, fileName=${str(this.fileName)})`
  }
}

jsonProperties(Book, {
  series: { nullable: 'String' },
  number: { nullable: 'String' },
  volume: { nullable: 'Int' },
  year: { nullable: 'Int' },
  fileName: { nullable: 'String' },
})
json(Book, {
  ignoreUnknown: true,
  rename: { series: 'Series', number: 'Number', volume: 'Volume', year: 'Year', fileName: 'FileName' },
})
