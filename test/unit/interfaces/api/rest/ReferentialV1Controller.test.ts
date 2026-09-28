// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/ReferentialV1ControllerOracleTest.kt
import { ReferentialV1Controller } from '../../../../../src/interfaces/api/rest/ReferentialV1Controller.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'
import { principal } from './rest-oracle.js'
import * as samples from './rest-samples.js'

const { func, kase } = oracle('interfaces/api/rest/ReferentialV1Controller')

const db = new OracleDb()
const c = new ReferentialV1Controller(db.referentialDao)
const admin = principal(samples.admin)
const l1 = principal(samples.l1Only)
const kids = principal(samples.kids)
const none = new Set<string>()
const set = (...ids: string[]) => new Set(ids)

func('getAuthorsNames', () => {
  kase('empty database', () => c.getAuthorsNames(admin, ''))
  kase('admin, all', () => {
    samples.seed(db)
    return c.getAuthorsNames(admin, '')
  })
  kase('search', () => c.getAuthorsNames(admin, 'pen'))
  kase('search accent and case', () => c.getAuthorsNames(admin, 'AUTHOR s'))
  kase('library restricted', () => c.getAuthorsNames(l1, ''))
  kase('age restricted user', () => c.getAuthorsNames(kids, ''))
})
func('getAuthorsRoles', () => {
  kase('admin', () => c.getAuthorsRoles(admin))
  kase('library restricted', () => c.getAuthorsRoles(l1))
})
func('getGenres', () => {
  kase('admin', () => c.getGenres(admin, none, null))
  kase('library L2', () => c.getGenres(admin, set('L2'), null))
  kase('library L1 and unknown', () => c.getGenres(admin, set('L1', 'LX'), null))
  kase('collection C2', () => c.getGenres(admin, none, 'C2'))
  kase('collection C1, library restricted', () => c.getGenres(l1, none, 'C1'))
  kase('library restricted asks L2', () => c.getGenres(l1, set('L2'), null))
})
func('getSharingLabels', () => {
  kase('admin', () => c.getSharingLabels(admin, none, null))
  kase('library L1', () => c.getSharingLabels(admin, set('L1'), null))
  kase('collection C1', () => c.getSharingLabels(admin, none, 'C1'))
  kase('library restricted', () => c.getSharingLabels(l1, none, null))
})
func('getTags', () => {
  kase('admin', () => c.getTags(admin, none, null))
  kase('library L2', () => c.getTags(admin, set('L2'), null))
  kase('collection C1', () => c.getTags(admin, none, 'C1'))
  kase('library restricted', () => c.getTags(l1, none, null))
})
func('getBookTags', () => {
  kase('admin', () => c.getBookTags(admin, null, null, none))
  kase('series S1', () => c.getBookTags(admin, 'S1', null, none))
  kase('read list R1', () => c.getBookTags(admin, null, 'R1', none))
  kase('library L2', () => c.getBookTags(admin, null, null, set('L2')))
  kase('library restricted asks L2', () => c.getBookTags(l1, null, null, set('L2')))
  kase('series takes precedence', () => c.getBookTags(admin, 'S3', 'R1', set('L1')))
})
func('getSeriesTags', () => {
  kase('admin', () => c.getSeriesTags(admin, null, null))
  kase('library L1', () => c.getSeriesTags(admin, 'L1', null))
  kase('collection C2', () => c.getSeriesTags(admin, null, 'C2'))
  kase('library restricted', () => c.getSeriesTags(l1, null, null))
})
func('getLanguages', () => {
  kase('admin', () => c.getLanguages(admin, none, null))
  kase('library L2', () => c.getLanguages(admin, set('L2'), null))
  kase('collection C1', () => c.getLanguages(admin, none, 'C1'))
  kase('library restricted', () => c.getLanguages(l1, none, null))
})
func('getPublishers', () => {
  kase('admin', () => c.getPublishers(admin, none, null))
  kase('library L1', () => c.getPublishers(admin, set('L1'), null))
  kase('collection C2', () => c.getPublishers(admin, none, 'C2'))
  kase('library restricted', () => c.getPublishers(l1, none, null))
})
func('getAgeRatings', () => {
  kase('admin, null is None', () => c.getAgeRatings(admin, none, null))
  kase('library L1', () => c.getAgeRatings(admin, set('L1'), null))
  kase('collection C2', () => c.getAgeRatings(admin, none, 'C2'))
  kase('library restricted', () => c.getAgeRatings(l1, none, null))
})
func('getSeriesReleaseDates', () => {
  kase('admin', () => c.getSeriesReleaseDates(admin, none, null))
  kase('library L2', () => c.getSeriesReleaseDates(admin, set('L2'), null))
  kase('collection C1', () => c.getSeriesReleaseDates(admin, none, 'C1'))
  kase('library restricted', () => c.getSeriesReleaseDates(l1, none, null))
})
