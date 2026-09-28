// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/validation/NullOrBlankOrBCP47.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type Constraint, constraintDefinition, Null } from '../../port/validation.js'
import { BCP47 } from './BCP47.js'
import { Blank } from './Blank.js'

// PORT: annotation class -> fabrique de Constraint (port/validation.ts) ; groups/payload non portés
export const NullOrBlankOrBCP47 = ({ message = 'Must be null or blank or valid BCP 47 language tag' }: { message?: string } = {}): Constraint => ({ type: 'NullOrBlankOrBCP47', message })

// @ConstraintComposition(CompositionType.OR) @Constraint(validatedBy = []) @Null @Blank @BCP47
constraintDefinition('NullOrBlankOrBCP47', { validatedBy: [], composition: 'OR', composingConstraints: () => [Null(), Blank(), BCP47()] })
