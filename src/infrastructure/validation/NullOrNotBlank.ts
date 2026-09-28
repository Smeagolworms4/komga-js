// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/validation/NullOrNotBlank.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type Constraint, constraintDefinition, NotBlank, Null } from '../../port/validation.js'

// PORT: annotation class -> fabrique de Constraint (port/validation.ts) ; groups/payload non portés
export const NullOrNotBlank = ({ message = 'Must be null or not blank' }: { message?: string } = {}): Constraint => ({ type: 'NullOrNotBlank', message })

// @ConstraintComposition(CompositionType.OR) @Constraint(validatedBy = []) @Null @NotBlank
constraintDefinition('NullOrNotBlank', { validatedBy: [], composition: 'OR', composingConstraints: () => [Null(), NotBlank()] })
