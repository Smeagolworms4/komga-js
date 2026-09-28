// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/domain/model/KomgaUserOracleTest.kt
import { LocalDateTime } from '@js-joda/core'
import { AgeRestriction, AllowExclude } from '../../../../src/domain/model/AgeRestriction.js'
import { ContentRestrictions } from '../../../../src/domain/model/ContentRestrictions.js'
import { KomgaUser } from '../../../../src/domain/model/KomgaUser.js'
import { Library } from '../../../../src/domain/model/Library.js'
import { UserRoles } from '../../../../src/domain/model/UserRoles.js'
import { URL } from '../../../../src/port/java-net.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('domain/model/KomgaUser')

const date = LocalDateTime.of(2020, 5, 17, 10, 11, 12, 13000000)

const user = ({
  roles = new Set([UserRoles.FILE_DOWNLOAD, UserRoles.PAGE_STREAMING]),
  shared = new Set<string>(),
  all = true,
  restrictions = new ContentRestrictions(),
}: { roles?: Set<UserRoles>; shared?: Set<string>; all?: boolean; restrictions?: ContentRestrictions } = {}) =>
  new KomgaUser({ email: 'user@example.org', password: 'secret', roles, sharedLibrariesIds: shared, sharedAllLibraries: all, restrictions, id: 'U1', createdDate: date })

const admin = user({ roles: new Set([UserRoles.ADMIN]), all: false })
const limited = user({ shared: new Set(['L1', 'L2']), all: false })
const limitedNone = user({ all: false })
const unlimited = user({ shared: new Set(['L1']) })

const ageRestricted = (age: number, type: AllowExclude, allow: Set<string> = new Set(), exclude: Set<string> = new Set()) =>
  user({ restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age, restriction: type }), labelsAllow: allow, labelsExclude: exclude }) })

func('getAuthorizedLibraryIds', () => {
  kase('limited, null', () => limited.getAuthorizedLibraryIds(null))
  kase('limited, filter', () => limited.getAuthorizedLibraryIds(['L2', 'L3', 'L1']))
  kase('limited, empty filter', () => limited.getAuthorizedLibraryIds([]))
  kase('limited, duplicates', () => limited.getAuthorizedLibraryIds(['L1', 'L1', 'L2']))
  kase('limited none, null', () => limitedNone.getAuthorizedLibraryIds(null))
  kase('limited none, filter', () => limitedNone.getAuthorizedLibraryIds(['L1']))
  kase('unlimited, null', () => unlimited.getAuthorizedLibraryIds(null))
  kase('unlimited, filter', () => unlimited.getAuthorizedLibraryIds(['L9', 'L1', 'L9']))
  kase('unlimited, set filter', () => unlimited.getAuthorizedLibraryIds(new Set(['B', 'A'])))
  kase('admin, null', () => admin.getAuthorizedLibraryIds(null))
  kase('admin, filter', () => admin.getAuthorizedLibraryIds(['X']))
})

func('canAccessAllLibraries', () => {
  kase('default', () => user().canAccessAllLibraries())
  kase('limited', () => limited.canAccessAllLibraries())
  kase('admin not shared all', () => admin.canAccessAllLibraries())
  kase('admin among roles', () => user({ roles: new Set([UserRoles.PAGE_STREAMING, UserRoles.ADMIN]), all: false }).canAccessAllLibraries())
  kase('no roles', () => user({ roles: new Set(), all: false }).canAccessAllLibraries())
})

func('canAccessLibrary@50', () => {
  kase('limited, shared', () => limited.canAccessLibrary('L1'))
  kase('limited, not shared', () => limited.canAccessLibrary('L3'))
  kase('limited, case', () => limited.canAccessLibrary('l1'))
  kase('limited, empty', () => limited.canAccessLibrary(''))
  kase('unlimited', () => unlimited.canAccessLibrary('anything'))
  kase('admin', () => admin.canAccessLibrary('L3'))
  kase('limited none', () => limitedNone.canAccessLibrary('L1'))
})

func('canAccessLibrary@52', () => {
  const lib = (id: string) => new Library({ name: 'n', root: new URL('file:/x'), id, createdDate: date })
  kase('limited, shared', () => limited.canAccessLibrary(lib('L2')))
  kase('limited, not shared', () => limited.canAccessLibrary(lib('L3')))
  kase('unlimited', () => unlimited.canAccessLibrary(lib('L3')))
  kase('admin', () => admin.canAccessLibrary(lib('L3')))
})

func('isContentAllowed', () => {
  const none = user()
  kase('no restriction, defaults', () => none.isContentAllowed())
  kase('no restriction, age and labels', () => none.isContentAllowed({ ageRating: 18, sharingLabels: new Set(['x']) }))

  const allow12 = ageRestricted(12, AllowExclude.ALLOW_ONLY)
  kase('allow only 12, null age', () => allow12.isContentAllowed())
  kase('allow only 12, 11', () => allow12.isContentAllowed({ ageRating: 11 }))
  kase('allow only 12, 12', () => allow12.isContentAllowed({ ageRating: 12 }))
  kase('allow only 12, 13', () => allow12.isContentAllowed({ ageRating: 13 }))
  kase('allow only 12, negative', () => allow12.isContentAllowed({ ageRating: -1 }))
  kase('allow only 0, 0', () => ageRestricted(0, AllowExclude.ALLOW_ONLY).isContentAllowed({ ageRating: 0 }))

  const exclude16 = ageRestricted(16, AllowExclude.EXCLUDE)
  kase('exclude 16, null age', () => exclude16.isContentAllowed())
  kase('exclude 16, 15', () => exclude16.isContentAllowed({ ageRating: 15 }))
  kase('exclude 16, 16', () => exclude16.isContentAllowed({ ageRating: 16 }))
  kase('exclude 16, 99', () => exclude16.isContentAllowed({ ageRating: 99 }))
  kase('exclude 16, min int', () => exclude16.isContentAllowed({ ageRating: -2147483648 }))

  const allowKids = user({ restrictions: new ContentRestrictions({ labelsAllow: new Set(['kids', 'Family']) }) })
  kase('allow labels, none', () => allowKids.isContentAllowed())
  kase('allow labels, match', () => allowKids.isContentAllowed({ sharingLabels: new Set(['kids']) }))
  kase('allow labels, match case and spaces', () => allowKids.isContentAllowed({ sharingLabels: new Set([' FAMILY ']) }))
  kase('allow labels, no match', () => allowKids.isContentAllowed({ sharingLabels: new Set(['adult']) }))
  kase('allow labels, blank labels', () => allowKids.isContentAllowed({ sharingLabels: new Set([' ', '']) }))
  kase('allow labels, one of', () => allowKids.isContentAllowed({ sharingLabels: new Set(['adult', 'kids']) }))

  const excludeGore = user({ restrictions: new ContentRestrictions({ labelsExclude: new Set(['gore']) }) })
  kase('exclude labels, none', () => excludeGore.isContentAllowed())
  kase('exclude labels, match', () => excludeGore.isContentAllowed({ sharingLabels: new Set(['Gore']) }))
  kase('exclude labels, other', () => excludeGore.isContentAllowed({ sharingLabels: new Set(['kids']) }))
  kase('exclude labels, mixed', () => excludeGore.isContentAllowed({ sharingLabels: new Set(['kids', 'GORE ']) }))

  const combined = ageRestricted(12, AllowExclude.ALLOW_ONLY, new Set(['kids']))
  kase('allow age or label, both ok', () => combined.isContentAllowed({ ageRating: 10, sharingLabels: new Set(['kids']) }))
  kase('allow age or label, age ok', () => combined.isContentAllowed({ ageRating: 10, sharingLabels: new Set(['adult']) }))
  kase('allow age or label, label ok', () => combined.isContentAllowed({ ageRating: 18, sharingLabels: new Set(['kids']) }))
  kase('allow age or label, none ok', () => combined.isContentAllowed({ ageRating: 18, sharingLabels: new Set(['adult']) }))
  kase('allow age or label, null age, label ok', () => combined.isContentAllowed({ ageRating: null, sharingLabels: new Set(['kids']) }))
  kase('allow age or label, nothing', () => combined.isContentAllowed())

  const excludeBoth = ageRestricted(16, AllowExclude.EXCLUDE, new Set(), new Set(['gore']))
  kase('exclude age and label, clean', () => excludeBoth.isContentAllowed({ ageRating: 10, sharingLabels: new Set(['kids']) }))
  kase('exclude age and label, age', () => excludeBoth.isContentAllowed({ ageRating: 16, sharingLabels: new Set(['kids']) }))
  kase('exclude age and label, label', () => excludeBoth.isContentAllowed({ ageRating: 10, sharingLabels: new Set(['gore']) }))

  const allowAndExclude = ageRestricted(12, AllowExclude.ALLOW_ONLY, new Set(['kids']), new Set(['gore']))
  kase('allow then exclude label', () => allowAndExclude.isContentAllowed({ ageRating: 10, sharingLabels: new Set(['kids', 'gore']) }))
  kase('allow label excluded too', () =>
    user({ restrictions: new ContentRestrictions({ labelsAllow: new Set(['a']), labelsExclude: new Set(['a']) }) }).isContentAllowed({ sharingLabels: new Set(['a']) }),
  )
  kase('allow age, exclude labels', () => ageRestricted(12, AllowExclude.ALLOW_ONLY, new Set(), new Set(['gore'])).isContentAllowed({ ageRating: 10, sharingLabels: new Set(['x']) }))
  kase('exclude age, allow labels', () => ageRestricted(16, AllowExclude.EXCLUDE, new Set(['kids'])).isContentAllowed({ ageRating: 10, sharingLabels: new Set(['adult']) }))
  kase('exclude age, allow labels, null age', () => ageRestricted(16, AllowExclude.EXCLUDE, new Set(['kids'])).isContentAllowed({ ageRating: null, sharingLabels: new Set(['kids']) }))
  kase('unicode labels', () => user({ restrictions: new ContentRestrictions({ labelsAllow: new Set(['émile']) }) }).isContentAllowed({ sharingLabels: new Set(['ÉMILE']) }))
})

func('toString', () => {
  kase('default', () => user().toString())
  kase('full', () =>
    new KomgaUser({
      email: "a'b@x.org",
      password: 'pwd',
      roles: new Set([UserRoles.ADMIN, UserRoles.KOBO_SYNC]),
      sharedLibrariesIds: new Set(['L2', 'L1']),
      sharedAllLibraries: false,
      restrictions: new ContentRestrictions({ ageRestriction: new AgeRestriction({ age: 10, restriction: AllowExclude.EXCLUDE }), labelsAllow: new Set(['b']), labelsExclude: new Set(['c']) }),
      id: 'ID',
      createdDate: LocalDateTime.of(2021, 1, 1, 0, 0),
      lastModifiedDate: LocalDateTime.of(2022, 2, 2, 2, 2, 2, 2),
    }).toString(),
  )
  kase('password not shown', () => user().toString().includes('secret'))
})
