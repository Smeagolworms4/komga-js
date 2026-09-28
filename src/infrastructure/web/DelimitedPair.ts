// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/web/DelimitedPair.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { type ArgSpec, customArg } from '../../port/spring-web.js'

// PORT: annotation de paramètre -> ArgSpec 'custom' résolu par DelimitedPairHandlerMethodArgumentResolver
// (@Retention(AnnotationRetention.RUNTIME), @Target(AnnotationTarget.VALUE_PARAMETER))
/** @deprecated was used only for search_regex which is deprecated */
export const DelimitedPair = (parameterName: string): ArgSpec => customArg('DelimitedPair', parameterName, { required: false })
