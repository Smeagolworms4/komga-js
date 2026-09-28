// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/web/Authors.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type ArgSpec, customArg } from '../../port/spring-web.js'

// PORT: annotation de paramètre -> ArgSpec 'custom' résolu par AuthorsHandlerMethodArgumentResolver
// (@Retention(AnnotationRetention.RUNTIME), @Target(AnnotationTarget.VALUE_PARAMETER))
export const Authors = (): ArgSpec => customArg('Authors', 'author', { required: false })
