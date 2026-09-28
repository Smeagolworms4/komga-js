// Support de portage : réexportations (historique). Les définitions sont dans :
// - port/kotlin.ts : sealedInterface, DataObject
// - port/jackson-mapper.ts : JsonType, JsonTypes, jsonProperties, jsonTypeInfoDeduction, ObjectMapper
// Ce fichier n'a pas de jumeau Kotlin.
import { ObjectMapper } from './jackson-mapper.js'

export { DataObject, type SealedInterface, sealedInterface, sealedInterfaceList } from './kotlin.js'
export { type JsonType, JsonTypes, jsonProperties, jsonTypeInfoDeduction } from './jackson-mapper.js'

/** ObjectMapper configuré comme celui de Spring Boot (injecté dans les tests Kotlin) */
export const objectMapper = new ObjectMapper()
