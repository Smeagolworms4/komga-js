// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/AuthorDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { Author } from '../../../../domain/model/Author.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'

type AuthorDtoParams = {
  name: string
  role: string
}

export class AuthorDto extends DataClass<AuthorDtoParams> {
  readonly name: string
  readonly role: string

  constructor({ name, role }: AuthorDtoParams) {
    super()
    this.name = name
    this.role = role
  }
}

export function toDto(self: Author): AuthorDto {
  return new AuthorDto({ name: self.name, role: self.role })
}

jsonProperties(AuthorDto, { name: 'String', role: 'String' }, [], { required: ['name', 'role'] })
