// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/kobo/dto/TestsDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { json } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type TestsDtoParams = {
  result: string
  testKey: string
  tests?: Map<string, string>
}

// @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class)
export class TestsDto extends DataClass<TestsDtoParams> {
  readonly result: string
  readonly testKey: string
  readonly tests: Map<string, string>

  constructor({ result, testKey, tests = new Map() }: TestsDtoParams) {
    super()
    this.result = result
    this.testKey = testKey
    this.tests = tests
  }
}

// PORT: @JsonNaming(PropertyNamingStrategies.UpperCamelCaseStrategy::class) -> noms JSON explicites
json(TestsDto, { rename: { result: 'Result', testKey: 'TestKey', tests: 'Tests' } })
jsonProperties(
  TestsDto,
  {
    result: 'String',
    testKey: 'String',
    tests: { map: 'String' },
  },
  [],
  { required: ['result', 'testKey'] },
)
