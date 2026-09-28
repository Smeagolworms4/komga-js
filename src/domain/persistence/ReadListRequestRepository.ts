// @port-of komga/src/main/kotlin/org/gotson/komga/domain/persistence/ReadListRequestRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { ReadListRequestBook, ReadListRequestBookMatches } from '../model/ReadListRequest.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class ReadListRequestRepository {
  abstract matchBookRequests(requests: Iterable<ReadListRequestBook>): ReadListRequestBookMatches[]
}
