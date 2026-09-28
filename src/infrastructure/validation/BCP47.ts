// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/validation/BCP47.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { BCP47TagValidator } from '../../domain/model/BCP47TagValidator.js'
import { type Constraint, type ConstraintValidator, type ConstraintValidatorContext, constraintDefinition } from '../../port/validation.js'

// PORT: annotation class -> fabrique de Constraint (port/validation.ts) ; groups/payload non portés
export const BCP47 = ({ message = 'Must be a valid BCP 47 language tag' }: { message?: string } = {}): Constraint => ({ type: 'BCP47', message })

export class BCP47Validator implements ConstraintValidator {
  isValid(value: string | null, context: ConstraintValidatorContext | null): boolean {
    if (value === null || value === undefined) return false
    return BCP47TagValidator.isValid(value)
  }
}

// @Constraint(validatedBy = [BCP47Validator::class])
constraintDefinition('BCP47', { validatedBy: [BCP47Validator] })
