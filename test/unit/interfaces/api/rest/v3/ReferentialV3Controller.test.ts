// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/v3/ReferentialV3ControllerOracleTest.kt
import { NotableEntity } from '../../../../../../src/domain/model/NotableEntity.js'
import { ReferentialV3Controller } from '../../../../../../src/interfaces/api/rest/v3/ReferentialV3Controller.js'
import { Order, PageRequest, Sort } from '../../../../../../src/port/spring-data.js'
import { OracleDb } from '../../../../db.js'
import { oracle } from '../../../../oracle.js'
import { principal } from '../rest-oracle.js'
import * as samples from '../rest-samples.js'

const { func, kase } = oracle('interfaces/api/rest/v3/ReferentialV3Controller')

const db = new OracleDb()
const c = new ReferentialV3Controller(db.referentialDao)
const admin = principal(samples.admin)
const l1 = principal(samples.l1Only)
const kids = principal(samples.kids)
const noAdult = principal(samples.noAdult)
const p20 = PageRequest.of(0, 20)
const p1 = PageRequest.of(1, 1)
const set = (...ids: string[]) => new Set(ids)
const ne = (kind: string, name: string) => new NotableEntity({ kind, name })
const _ = undefined

func('getNotableEntities', () => {
  kase('empty database', () => c.getNotableEntities(admin, null, null, _, _, _, _, _, p20))
  kase('admin', () => {
    samples.seed(db)
    const data: [string, NotableEntity[]][] = [
      ['B1', [ne('team', 'Avengers'), ne('location', 'New York')]],
      ['B2', [ne('character', 'Thor'), ne('team', 'Avengers')]],
      ['B3', [ne('character', 'Beta Girl'), ne('location', 'Paris')]],
      ['B4', [ne('character', 'One')]],
    ]
    for (const [id, entities] of data) db.bookMetadataDao.update(db.bookMetadataDao.findById(id).copy({ notableEntities: entities }))
    return c.getNotableEntities(admin, null, null, _, _, _, _, _, p20)
  })
  kase('search and kind', () => c.getNotableEntities(admin, 'e', 'character', _, _, _, _, _, p20))
  kase('unpaged', () => c.getNotableEntities(admin, null, null, _, _, _, _, true, p1))
  kase('second page of 1', () => c.getNotableEntities(admin, null, null, _, _, _, _, _, p1))
  kase('sort ignored', () => c.getNotableEntities(admin, null, null, _, _, _, _, _, PageRequest.of(0, 2, Sort.by(Order.desc('name')))))
  kase('library L2', () => c.getNotableEntities(admin, null, null, set('L2'), _, _, _, _, p20))
  kase('collection C2', () => c.getNotableEntities(admin, null, null, _, set('C2'), _, _, _, p20))
  kase('series S2', () => c.getNotableEntities(admin, null, null, _, _, set('S2'), _, _, p20))
  kase('read list R1', () => c.getNotableEntities(admin, null, null, _, _, _, set('R1'), _, p20))
  kase('library wins over series', () => c.getNotableEntities(admin, null, null, set('L2'), _, set('S1'), _, _, p20))
  kase('library restricted', () => c.getNotableEntities(l1, null, null, _, _, _, _, _, p20))
  kase('age restricted', () => c.getNotableEntities(kids, null, null, _, _, _, _, _, p20))
  kase('label excluded', () => c.getNotableEntities(noAdult, null, null, _, _, _, _, _, p20))
})
func('getNotableEntitiesKinds', () => {
  kase('admin', () => c.getNotableEntitiesKinds(admin, _, _, _, _, _, p20))
  kase('series S2', () => c.getNotableEntitiesKinds(admin, _, _, set('S2'), _, _, p20))
  kase('unpaged', () => c.getNotableEntitiesKinds(kids, _, _, _, _, true, p1))
  kase('page 1', () => c.getNotableEntitiesKinds(admin, _, _, _, _, _, p1))
})
func('getNotableEntitiesNames', () => {
  kase('admin', () => c.getNotableEntitiesNames(admin, null, null, _, _, _, _, _, p20))
  kase('search', () => c.getNotableEntitiesNames(admin, 'ar', null, _, _, _, _, _, p20))
  kase('kind', () => c.getNotableEntitiesNames(admin, null, 'team', _, _, _, set('R1'), _, p20))
  kase('restricted', () => c.getNotableEntitiesNames(l1, null, null, _, _, _, _, _, p1))
})
