// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/validation/NullOrNotEmpty.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type Constraint, constraintDefinition, NotEmpty, Null } from '../../port/validation.js'

// PORT: annotation class -> fabrique de Constraint (port/validation.ts) ; groups/payload non portés
export const NullOrNotEmpty = ({ message = 'Must be null or not empty' }: { message?: string } = {}): Constraint => ({ type: 'NullOrNotEmpty', message })

// @ConstraintComposition(CompositionType.OR) @Constraint(validatedBy = []) @Null @NotEmpty
constraintDefinition('NullOrNotEmpty', { validatedBy: [], composition: 'OR', composingConstraints: () => [Null(), NotEmpty()] })
