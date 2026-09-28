// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/validation/NullOrBlankOrISBN.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type Constraint, constraintDefinition, ISBN, Null } from '../../port/validation.js'
import { Blank } from './Blank.js'

// PORT: annotation class -> fabrique de Constraint (port/validation.ts) ; groups/payload non portés
export const NullOrBlankOrISBN = ({ message = 'Must be null or blank or valid ISBN-13' }: { message?: string } = {}): Constraint => ({ type: 'NullOrBlankOrISBN', message })

// @ConstraintComposition(CompositionType.OR) @Constraint(validatedBy = []) @Null @Blank @ISBN
constraintDefinition('NullOrBlankOrISBN', { validatedBy: [], composition: 'OR', composingConstraints: () => [Null(), Blank(), ISBN()] })
