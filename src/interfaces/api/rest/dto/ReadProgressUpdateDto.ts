// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/dto/ReadProgressUpdateDto.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { registerClass } from '../../../../port/jackson.js'
import { jsonProperties } from '../../../../port/jackson-mapper.js'
import { DataClass } from '../../../../port/kotlin.js'
import { type Constraint, Positive, classConstraints, constraints } from '../../../../port/validation.js'

type ReadProgressUpdateDtoParams = {
  page: number | null
  completed: boolean | null
}

// @ReadProgressUpdateDtoConstraint
export class ReadProgressUpdateDto extends DataClass<ReadProgressUpdateDtoParams> {
  readonly page: number | null
  readonly completed: boolean | null

  constructor({ page, completed }: ReadProgressUpdateDtoParams) {
    super()
    this.page = page
    this.completed = completed
  }
}

// PORT: annotation de contrainte Kotlin -> fabrique de Constraint (@Constraint(validatedBy = [ReadProgressUpdateDtoValidator::class]),
// @Target(AnnotationTarget.CLASS), @Retention(AnnotationRetention.RUNTIME))
export const ReadProgressUpdateDtoConstraint = (
  attrs: { message?: string; groups?: unknown[]; payload?: unknown[] } = {},
): Constraint => ({
  type: 'ReadProgressUpdateDtoConstraint',
  message: attrs.message ?? 'page must be specified if completed is false or null',
  groups: attrs.groups ?? [],
  payload: attrs.payload ?? [],
  validatedBy: [ReadProgressUpdateDtoValidator],
})

// PORT: ConstraintValidator<ReadProgressUpdateDtoConstraint, ReadProgressUpdateDto> ; le contexte n'est pas typé
export class ReadProgressUpdateDtoValidator {
  isValid(value: ReadProgressUpdateDto | null, context: unknown | null): boolean {
    return value !== null && (value.page !== null || (value.completed !== null && value.completed))
  }
}

classConstraints(ReadProgressUpdateDto, [ReadProgressUpdateDtoConstraint()])
constraints(ReadProgressUpdateDto, { page: [Positive()] })
jsonProperties(ReadProgressUpdateDto, { page: { nullable: 'Int' }, completed: { nullable: 'Boolean' } })

// PORT: nom qualifié de la classe Kotlin (messages de Jackson)
registerClass('org.gotson.komga.interfaces.api.rest.dto.ReadProgressUpdateDto', ReadProgressUpdateDto)
