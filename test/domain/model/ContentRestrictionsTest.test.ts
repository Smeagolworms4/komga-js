// @port-of komga/src/test/kotlin/org/gotson/komga/domain/model/ContentRestrictionsTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { AgeRestriction, AllowExclude } from '../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../src/domain/model/ContentRestrictions.js'
import { nn } from '../../../src/port/kotlin.js'

describe('ContentRestrictionsTest', () => {
  it('given no arguments when creating restriction then all restrictions are null', () => {
    const restriction = new ContentRestrictions()

    expect(restriction.ageRestriction).toBeNull()
    expect(restriction.labelsAllow.size).toBe(0)
    expect(restriction.labelsExclude.size).toBe(0)
  })

  it('given AllowOnlyUnder restriction only when creating restriction then label restrictions are null', () => {
    const restriction = new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 10, restriction: AllowExclude.ALLOW_ONLY }) })

    expect(restriction.ageRestriction).not.toBeNull()
    expect(nn(restriction.ageRestriction).age).toBe(10)
    expect(nn(restriction.ageRestriction).restriction).toBe(AllowExclude.ALLOW_ONLY)

    expect(restriction.labelsAllow.size).toBe(0)
    expect(restriction.labelsExclude.size).toBe(0)
  })

  it('given ExcludeOver only when creating restriction then label restrictions are null', () => {
    const restriction = new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 10, restriction: AllowExclude.EXCLUDE }) })

    expect(restriction.ageRestriction).not.toBeNull()
    expect(nn(restriction.ageRestriction).age).toBe(10)
    expect(nn(restriction.ageRestriction).restriction).toBe(AllowExclude.EXCLUDE)

    expect(restriction.labelsAllow.size).toBe(0)
    expect(restriction.labelsExclude.size).toBe(0)
  })

  it('given empty labels when creating restriction then label restrictions are normalized', () => {
    const restriction = new ContentRestrictions({
      labelsAllow: new Set(['', ' ']),
      labelsExclude: new Set(['', ' ']),
    })

    expect(restriction.labelsAllow.size).toBe(0)
    expect(restriction.labelsExclude.size).toBe(0)
  })

  it('given labels with duplicate values when creating restriction then label restrictions are normalized', () => {
    const restriction = new ContentRestrictions({
      labelsAllow: new Set(['a', 'b', 'B', 'b ', 'b', ' B ']),
      labelsExclude: new Set(['c', 'd', 'D', 'd ', 'd', ' D ']),
    })

    expect([...restriction.labelsAllow].sort()).toEqual(['a', 'b'])
    expect([...restriction.labelsExclude].sort()).toEqual(['c', 'd'])
  })

  it('given labels with same value in both allow and exclude when creating restriction then exclude labels are removed from allow labels', () => {
    const restriction = new ContentRestrictions({
      labelsAllow: new Set(['a', 'b', 'B', 'b ', 'b', ' B ']),
      labelsExclude: new Set([' A ', 'd', 'D', 'd ', 'd', ' D ']),
    })

    expect([...restriction.labelsAllow].sort()).toEqual(['b'])
    expect([...restriction.labelsExclude].sort()).toEqual(['a', 'd'])
  })

  it('given allow labels with all values in exclude labels when creating restriction then allow labels is null', () => {
    const restriction = new ContentRestrictions({
      labelsAllow: new Set(['a', 'b', 'B', 'b ', 'b', ' B ']),
      labelsExclude: new Set([' A ', 'b', 'B', 'B ', 'b', ' B ']),
    })

    expect(restriction.labelsAllow.size).toBe(0)
    expect([...restriction.labelsExclude].sort()).toEqual(['a', 'b'])
  })
})
