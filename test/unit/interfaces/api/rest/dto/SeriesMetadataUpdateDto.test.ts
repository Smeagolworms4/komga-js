// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/dto/SeriesMetadataUpdateDtoOracleTest.kt
import { SeriesMetadataUpdateDto } from '../../../../../../src/interfaces/api/rest/dto/SeriesMetadataUpdateDto.js'
import { oracle } from '../../../../oracle.js'
import { read } from '../rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/dto/SeriesMetadataUpdateDto')

const props = ['readingDirection', 'ageRating', 'genres', 'tags', 'totalBookCount', 'sharingLabels', 'links', 'alternateTitles', 'summary', 'title']

const state = (src: string) => {
  const d = read<SeriesMetadataUpdateDto>(src, { class: SeriesMetadataUpdateDto })
  return [
    ...props.map((it) => d.isSet(it)),
    ...[d.status, d.title, d.summary, d.readingDirection, d.ageRating, d.genres, d.tags, d.totalBookCount, d.sharingLabels, d.language],
  ]
}

func('isSet', () => {
  kase('empty body', () => state('{}'))
  kase('nulls', () =>
    state('{"readingDirection":null,"ageRating":null,"genres":null,"tags":null,"totalBookCount":null,"sharingLabels":null,"links":null,"alternateTitles":null,"summary":null}'),
  )
  kase('values', () =>
    state('{"status":"ENDED","title":"t","summary":"s","readingDirection":"WEBTOON","ageRating":12,"genres":["b","a"],"tags":[],"totalBookCount":5,"sharingLabels":["x"],"language":"fr"}'),
  )
})
