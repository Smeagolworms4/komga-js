// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/persistence/ReadProgressDtoRepository.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import type { TachiyomiReadProgressDto } from '../rest/dto/TachiyomiReadProgressDto.js'
import type { TachiyomiReadProgressV2Dto } from '../rest/dto/TachiyomiReadProgressV2Dto.js'

// PORT: interface Kotlin -> classe abstraite (sert de jeton d'injection)
export abstract class ReadProgressDtoRepository {
  abstract findProgressV2BySeries(seriesId: string, userId: string): TachiyomiReadProgressV2Dto

  abstract findProgressByReadList(readListId: string, userId: string): TachiyomiReadProgressDto
}
