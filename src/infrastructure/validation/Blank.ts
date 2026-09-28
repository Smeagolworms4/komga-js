// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/validation/Blank.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { isBlank } from '../../port/kotlin.js'
import { type Constraint, type ConstraintValidator, type ConstraintValidatorContext, constraintDefinition } from '../../port/validation.js'

// PORT: annotation class -> fabrique de Constraint (port/validation.ts) ; groups/payload non portés
export const Blank = ({ message = 'Must be blank' }: { message?: string } = {}): Constraint => ({ type: 'Blank', message })

export class BlankValidator implements ConstraintValidator {
  isValid(value: string | null, context: ConstraintValidatorContext | null): boolean {
    if (value === null || value === undefined) return false
    return isBlank(value)
  }
}

// @Constraint(validatedBy = [BlankValidator::class])
constraintDefinition('Blank', { validatedBy: [BlankValidator] })
