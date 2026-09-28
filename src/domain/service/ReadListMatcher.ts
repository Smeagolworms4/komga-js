// @port-of komga/src/main/kotlin/org/gotson/komga/domain/service/ReadListMatcher.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { ReadListMatch, type ReadListRequest, ReadListRequestMatch } from '../model/ReadListRequest.js'
import { ReadListRepository } from '../persistence/ReadListRepository.js'
import { ReadListRequestRepository } from '../persistence/ReadListRequestRepository.js'
import { KotlinLogging } from '../../port/logging.js'
import { component } from '../../port/spring.js'

const logger = KotlinLogging.logger('org.gotson.komga.domain.service.ReadListMatcher')

export class ReadListMatcher {
  constructor(
    private readonly readListRepository: ReadListRepository,
    private readonly readListRequestRepository: ReadListRequestRepository,
  ) {}

  matchReadListRequest(request: ReadListRequest): ReadListRequestMatch {
    logger.info(() => `Trying to match ${request}`)

    const readListMatch = this.readListRepository.existsByName(request.name) ? new ReadListMatch({ name: request.name, errorCode: 'ERR_1009' }) : new ReadListMatch({ name: request.name })

    const matches = this.readListRequestRepository.matchBookRequests(request.books)

    return new ReadListRequestMatch({ readListMatch: readListMatch, requests: matches })
  }
}

// @Service
component(ReadListMatcher, { inject: [ReadListRepository, ReadListRequestRepository] })
