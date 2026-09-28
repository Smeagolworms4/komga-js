// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/jooq/ContentRestrictionsSearchHelper.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { AllowExclude } from '../../domain/model/AgeRestriction.js'
import type { ContentRestrictions } from '../../domain/model/ContentRestrictions.js'
import type { Condition } from '../../port/jooq/core.js'
import { DSL } from '../../port/jooq/dsl.js'
import { Tables } from '../../port/jooq/generated/main/Tables.js'
import { union } from '../../port/kotlin.js'
import { RequiredJoin } from './RequiredJoin.js'

export class ContentRestrictionsSearchHelper {
  constructor(readonly restrictions: ContentRestrictions) {}

  toCondition(): [Condition, Set<RequiredJoin>] {
    const ageAllowed: [Condition, Set<RequiredJoin>] =
      this.restrictions.ageRestriction?.restriction === AllowExclude.ALLOW_ONLY
        ? [
            Tables.SERIES_METADATA.AGE_RATING.isNotNull().and(Tables.SERIES_METADATA.AGE_RATING.lessOrEqual(this.restrictions.ageRestriction.age)),
            new Set([RequiredJoin.SeriesMetadata]),
          ]
        : [DSL.noCondition(), new Set()]

    const labelAllowed: [Condition, Set<RequiredJoin>] =
      this.restrictions.labelsAllow.size > 0
        ? [
            Tables.SERIES_METADATA.SERIES_ID.in(
              DSL.select(Tables.SERIES_METADATA_SHARING.SERIES_ID)
                .from(Tables.SERIES_METADATA_SHARING)
                .where(Tables.SERIES_METADATA_SHARING.LABEL.in(this.restrictions.labelsAllow)),
            ),
            new Set([RequiredJoin.SeriesMetadata]),
          ]
        : [DSL.noCondition(), new Set()]

    const ageDenied: [Condition, Set<RequiredJoin>] =
      this.restrictions.ageRestriction?.restriction === AllowExclude.EXCLUDE
        ? [
            Tables.SERIES_METADATA.AGE_RATING.isNull().or(Tables.SERIES_METADATA.AGE_RATING.lessThan(this.restrictions.ageRestriction.age)),
            new Set([RequiredJoin.SeriesMetadata]),
          ]
        : [DSL.noCondition(), new Set()]

    const labelDenied: [Condition, Set<RequiredJoin>] =
      this.restrictions.labelsExclude.size > 0
        ? [
            Tables.SERIES_METADATA.SERIES_ID.notIn(
              DSL.select(Tables.SERIES_METADATA_SHARING.SERIES_ID)
                .from(Tables.SERIES_METADATA_SHARING)
                .where(Tables.SERIES_METADATA_SHARING.LABEL.in(this.restrictions.labelsExclude)),
            ),
            new Set([RequiredJoin.SeriesMetadata]),
          ]
        : [DSL.noCondition(), new Set()]

    return [
      ageAllowed[0].or(labelAllowed[0]).and(ageDenied[0].and(labelDenied[0])),
      union(union(union(ageAllowed[1], labelAllowed[1]), ageDenied[1]), labelDenied[1]),
    ]
  }
}
