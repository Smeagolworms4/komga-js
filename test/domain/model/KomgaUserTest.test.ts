// @port-of komga/src/test/kotlin/org/gotson/komga/domain/model/KomgaUserTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { AgeRestriction, AllowExclude } from '../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../src/domain/model/ContentRestrictions.js'
import { KomgaUser } from '../../../src/domain/model/KomgaUser.js'

describe('KomgaUserTest', () => {
  const defaultUser = new KomgaUser({ email: 'user@example.org', password: 'aPassword' })

  describe('ContentRestriction', () => {
    it('given user with age AllowOnlyUnder restriction when checking for content restriction then it is accurate', () => {
      const user = defaultUser.copy({ restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 5, restriction: AllowExclude.ALLOW_ONLY }) }) })

      expect(user.isContentAllowed({ ageRating: 3 })).toBe(true)
      expect(user.isContentAllowed({ ageRating: 5 })).toBe(true)
      expect(user.isContentAllowed({ ageRating: 8 })).toBe(false)
      expect(user.isContentAllowed({ ageRating: null })).toBe(false)
    })

    it('given user with age ExcludeOver restriction when checking for content restriction then it is accurate', () => {
      const user = defaultUser.copy({ restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 16, restriction: AllowExclude.EXCLUDE }) }) })

      expect(user.isContentAllowed({ ageRating: 10 }), 'age 10 is allowed').toBe(true)
      expect(user.isContentAllowed({ ageRating: null }), 'age null is allowed').toBe(true)
      expect(user.isContentAllowed({ ageRating: 16 }), 'age 16 is not allowed').toBe(false)
      expect(user.isContentAllowed({ ageRating: 18 }), 'age 18 is not allowed').toBe(false)
    })

    it('given user with sharing label AllowOnly restriction when checking for content restriction then it is accurate', () => {
      const user = defaultUser.copy({ restrictions: new ContentRestrictions({ labelsAllow: new Set(['allow', 'this']) }) })

      expect(user.isContentAllowed({ sharingLabels: new Set(['allow']) }), 'any tag is fine: allow').toBe(true)
      expect(user.isContentAllowed({ sharingLabels: new Set(['this']) }), 'any tag is fine: this').toBe(true)
      expect(user.isContentAllowed({ sharingLabels: new Set(['allow', 'this']) }), 'both tags are fine').toBe(true)
      expect(user.isContentAllowed({ sharingLabels: new Set(['other']) }), 'no allowed tags: other').toBe(false)
      expect(user.isContentAllowed({ sharingLabels: new Set() }), 'no allowed tags: emptySet').toBe(false)
    })

    it('given user with sharing label Exclude restriction when checking for content restriction then it is accurate', () => {
      const user = defaultUser.copy({ restrictions: new ContentRestrictions({ labelsExclude: new Set(['exclude', 'this']) }) })

      expect(user.isContentAllowed({ sharingLabels: new Set() }), 'no label so no exclusion').toBe(true)
      expect(user.isContentAllowed({ sharingLabels: new Set(['allow']) }), 'label allow is not in exclusion list').toBe(true)
      expect(user.isContentAllowed({ sharingLabels: new Set(['other', 'this']) }), 'label this is in exclusion list, other label is ignored').toBe(false)
      expect(user.isContentAllowed({ sharingLabels: new Set(['this']) }), 'label this is in exclusion list').toBe(false)
    })

    it('given user with both sharing label AllowOnly and Exclude restriction when checking for content restriction then it is accurate', () => {
      const user = defaultUser.copy({
        restrictions: new ContentRestrictions({
          labelsAllow: new Set(['allow', 'both']),
          labelsExclude: new Set(['exclude', 'both']),
        }),
      })

      expect(user.isContentAllowed({ sharingLabels: new Set(['allow']) })).toBe(true)
      expect(user.isContentAllowed({ sharingLabels: new Set(['allow', 'other']) })).toBe(true)
      expect(user.isContentAllowed({ sharingLabels: new Set(['allow', 'both']) })).toBe(false)
      expect(user.isContentAllowed({ sharingLabels: new Set(['exclude']) })).toBe(false)
      expect(user.isContentAllowed({ sharingLabels: new Set() })).toBe(false)
    })

    it('given user with both age AllowOnlyUnder restriction and sharing label AllowOnly restriction when checking for content restriction then it is accurate', () => {
      const user = defaultUser.copy({
        restrictions: new ContentRestrictions({
          ageRestriction: new AgeRestriction({ age: 10, restriction: AllowExclude.ALLOW_ONLY }),
          labelsAllow: new Set(['allow']),
        }),
      })

      expect(user.isContentAllowed({ ageRating: 5 }), 'age 5 only is sufficient').toBe(true)
      expect(user.isContentAllowed({ ageRating: 15 }), 'age 15 is not allowed').toBe(false)
      expect(user.isContentAllowed({ ageRating: null }), 'missing age and no allowed label: age null').toBe(false)
      expect(user.isContentAllowed({ sharingLabels: new Set(['allow']) }), 'allowed tag is sufficient').toBe(true)
      expect(user.isContentAllowed({ sharingLabels: new Set(['other']) }), 'missing age and no allowed label: other').toBe(false)
      expect(user.isContentAllowed({ sharingLabels: new Set() }), 'missing age and empty set label').toBe(false)
      expect(user.isContentAllowed({ ageRating: 5, sharingLabels: new Set(['allow']) }), 'age and tag are good').toBe(true)
      expect(user.isContentAllowed({ ageRating: 5, sharingLabels: new Set(['other']) }), 'age is good, other tag is ignored').toBe(true)
      expect(user.isContentAllowed({ ageRating: 15, sharingLabels: new Set(['allow']) }), 'age is ignored, tag is allowed').toBe(true)
      expect(user.isContentAllowed({ ageRating: 15, sharingLabels: new Set(['other']) }), 'age is too high, and no tag is allowed').toBe(false)
    })

    it('given user with both age AllowOnlyUnder restriction and sharing label Exclude restriction when checking for content restriction then it is accurate', () => {
      const user = defaultUser.copy({
        restrictions: new ContentRestrictions({
          ageRestriction: new AgeRestriction({ age: 10, restriction: AllowExclude.ALLOW_ONLY }),
          labelsExclude: new Set(['exclude']),
        }),
      })

      expect(user.isContentAllowed({ ageRating: 5 })).toBe(true)
      expect(user.isContentAllowed({ ageRating: 15 })).toBe(false)
      expect(user.isContentAllowed({ ageRating: null })).toBe(false)
      expect(user.isContentAllowed({ sharingLabels: new Set(['exclude']) })).toBe(false)
      expect(user.isContentAllowed({ sharingLabels: new Set(['other']) })).toBe(false)
      expect(user.isContentAllowed({ sharingLabels: new Set() })).toBe(false)
      expect(user.isContentAllowed({ ageRating: 5, sharingLabels: new Set(['exclude']) })).toBe(false)
      expect(user.isContentAllowed({ ageRating: 5, sharingLabels: new Set(['other']) })).toBe(true)
      expect(user.isContentAllowed({ ageRating: 15, sharingLabels: new Set(['exclude']) })).toBe(false)
      expect(user.isContentAllowed({ ageRating: 15, sharingLabels: new Set(['other']) })).toBe(false)
    })
  })
})
