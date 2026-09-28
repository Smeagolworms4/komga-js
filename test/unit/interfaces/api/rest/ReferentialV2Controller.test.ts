// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/ReferentialV2ControllerOracleTest.kt
import { FilterTags } from '../../../../../src/domain/model/FilterBy.js'
import { ReferentialV2Controller } from '../../../../../src/interfaces/api/rest/ReferentialV2Controller.js'
import { Order, PageRequest, Sort } from '../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'
import { principal } from './rest-oracle.js'
import * as samples from './rest-samples.js'

const { func, kase } = oracle('interfaces/api/rest/ReferentialV2Controller')

const db = new OracleDb()
const c = new ReferentialV2Controller(db.referentialDao)
const admin = principal(samples.admin)
const l1 = principal(samples.l1Only)
const kids = principal(samples.kids)
const noAdult = principal(samples.noAdult)
const p20 = PageRequest.of(0, 20)
const p1 = PageRequest.of(1, 1)
const set = (...ids: string[]) => new Set(ids)
const _ = undefined

func('getAuthors', () => {
  kase('empty database', () => c.getAuthors(admin, null, null, _, _, _, _, _, p20))
  kase('admin', () => {
    samples.seed(db)
    return c.getAuthors(admin, null, null, _, _, _, _, _, p20)
  })
  kase('search and role', () => c.getAuthors(admin, 'author', 'writer', _, _, _, _, _, p20))
  kase('unpaged', () => c.getAuthors(admin, null, null, _, _, _, _, true, p1))
  kase('second page of 1', () => c.getAuthors(admin, null, null, _, _, _, _, _, p1))
  kase('sort ignored', () => c.getAuthors(admin, null, null, _, _, _, _, _, PageRequest.of(0, 2, Sort.by(Order.desc('name')))))
  kase('library L2', () => c.getAuthors(admin, null, null, set('L2'), _, _, _, _, p20))
  kase('collection C2', () => c.getAuthors(admin, null, null, _, set('C2'), _, _, _, p20))
  kase('series S2', () => c.getAuthors(admin, null, null, _, _, set('S2'), _, _, p20))
  kase('read list R1', () => c.getAuthors(admin, null, null, _, _, _, set('R1'), _, p20))
  kase('library wins over series', () => c.getAuthors(admin, null, null, set('L2'), _, set('S1'), _, _, p20))
  kase('library restricted', () => c.getAuthors(l1, null, null, _, _, _, _, _, p20))
  kase('age restricted', () => c.getAuthors(kids, null, null, _, _, _, _, _, p20))
  kase('label excluded', () => c.getAuthors(noAdult, null, null, _, _, _, _, _, p20))
})
func('getAuthorsRoles', () => {
  kase('admin', () => c.getAuthorsRoles(admin, _, _, _, _, _, p20))
  kase('series S3', () => c.getAuthorsRoles(admin, _, _, set('S3'), _, _, p20))
  kase('unpaged', () => c.getAuthorsRoles(kids, _, _, _, _, true, p1))
  kase('page 1', () => c.getAuthorsRoles(admin, _, _, _, _, _, p1))
})
func('getAuthorsNames', () => {
  kase('admin', () => c.getAuthorsNames(admin, null, null, _, _, _, _, _, p20))
  kase('search', () => c.getAuthorsNames(admin, 'pen b', null, _, _, _, _, _, p20))
  kase('role', () => c.getAuthorsNames(admin, null, 'penciller', _, _, _, set('R1'), _, p20))
  kase('restricted', () => c.getAuthorsNames(l1, null, null, _, _, _, _, _, p1))
})
func('getGenres', () => {
  kase('admin', () => c.getGenres(admin, null, _, _, _, p20))
  kase('search', () => c.getGenres(admin, 'DRA', _, _, _, p20))
  kase('library L2', () => c.getGenres(admin, null, set('L2'), _, _, p20))
  kase('collection C1', () => c.getGenres(admin, null, _, set('C1'), _, p20))
  kase('kids', () => c.getGenres(kids, null, _, _, _, p20))
  kase('unpaged', () => c.getGenres(noAdult, null, _, _, true, p1))
})
func('getSharingLabels', () => {
  kase('admin', () => c.getSharingLabels(admin, null, _, _, _, p20))
  kase('search', () => c.getSharingLabels(admin, 'ki', _, _, _, p20))
  kase('collection C1', () => c.getSharingLabels(admin, null, _, set('C1'), _, p1))
  kase('restricted', () => c.getSharingLabels(noAdult, null, _, _, _, p20))
})
func('getLanguages', () => {
  kase('admin', () => c.getLanguages(admin, null, _, _, _, p20))
  kase('search', () => c.getLanguages(admin, 'f', _, _, _, p20))
  kase('library L1', () => c.getLanguages(admin, null, set('L1'), _, _, p20))
  kase('kids unpaged', () => c.getLanguages(kids, null, _, _, true, p20))
})
func('getPublishers', () => {
  kase('admin', () => c.getPublishers(admin, null, _, _, _, p20))
  kase('search', () => c.getPublishers(admin, 'pub2', _, _, _, p20))
  kase('collection C2', () => c.getPublishers(admin, null, _, set('C2'), _, p20))
  kase('l1', () => c.getPublishers(l1, null, _, _, _, p1))
})
func('getTags', () => {
  kase('admin both', () => c.getTags(admin, null, _, _, _, _, _, _, p20))
  kase('series tags only', () => c.getTags(admin, null, _, _, _, _, FilterTags.SERIES, _, p20))
  kase('book tags only', () => c.getTags(admin, null, _, _, _, _, FilterTags.BOOK, _, p20))
  kase('search', () => c.getTags(admin, 'BT', _, _, _, _, _, _, p20))
  kase('series S3', () => c.getTags(admin, null, _, _, set('S3'), _, _, _, p20))
  kase('read list R1, book', () => c.getTags(admin, null, _, _, _, set('R1'), FilterTags.BOOK, _, p20))
  kase('library L1, series', () => c.getTags(admin, null, set('L1'), _, _, _, FilterTags.SERIES, _, p20))
  kase('collection C1', () => c.getTags(admin, null, _, set('C1'), _, _, _, _, p20))
  kase('kids', () => c.getTags(kids, null, _, _, _, _, _, _, p20))
  kase('unpaged page 1', () => c.getTags(admin, null, _, _, _, _, _, true, p1))
})
func('getSeriesReleaseYears', () => {
  kase('admin', () => c.getSeriesReleaseYears(admin, _, _, _, p20))
  kase('library L2', () => c.getSeriesReleaseYears(admin, set('L2'), _, _, p20))
  kase('collection C1', () => c.getSeriesReleaseYears(admin, _, set('C1'), _, p1))
  kase('kids', () => c.getSeriesReleaseYears(kids, _, _, _, p20))
})
func('getAgeRatings', () => {
  kase('admin', () => c.getAgeRatings(admin, _, _, _, p20))
  kase('library L1', () => c.getAgeRatings(admin, set('L1'), _, _, p20))
  kase('collection C2', () => c.getAgeRatings(admin, _, set('C2'), _, p20))
  kase('restricted unpaged', () => c.getAgeRatings(noAdult, _, _, true, p20))
})
