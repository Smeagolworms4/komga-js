// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/AnnouncementControllerOracleTest.kt
import { afterAll } from 'vitest'
import { AnnouncementController } from '../../../../../src/interfaces/api/rest/AnnouncementController.js'
import { OracleDb } from '../../../db.js'
import { oracle } from '../../../oracle.js'
import { Calls, fakeFetch, thrown, mapper, principal, user } from './rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/AnnouncementController')

const db = new OracleDb()
const calls = new Calls()
let response: [number, string] = [200, '']
afterAll(fakeFetch(calls, () => response))
const controller = new AnnouncementController(db.komgaUserDao, mapper)
const admin = user('U1')
const other = user('U2')

const feed = `{"version":"https://jsonfeed.org/version/1","title":"Komga","home_page_url":"https://komga.org/blog","description":"Blog",
"items":[
{"id":"https://komga.org/blog/b","url":"https://komga.org/blog/b","title":"B","summary":"sb","content_html":"<p>b</p>",
"date_modified":"2024-02-03T04:05:06Z","author":{"name":"gotson","url":"https://github.com/gotson"},"tags":["x","y"],"_komga":{"read":true}},
{"id":"https://komga.org/blog/a","content_html":"<p>a</p>","date_modified":"2023-12-31T23:00:00+01:00"}
]}`

func('fetchWebsiteAnnouncements', () => {
  kase('feed', async () => {
    response = [200, feed]
    return [await controller.fetchWebsiteAnnouncements(), calls.take()]
  })
  kase('empty body', async () => {
    response = [200, '']
    return [await controller.fetchWebsiteAnnouncements(), calls.take()]
  })
  kase('invalid json', async () => {
    response = [200, '{"version":']
    return [await thrown(() => controller.fetchWebsiteAnnouncements()), calls.take()]
  })
  kase('error', async () => {
    response = [404, '']
    const r = await thrown(() => controller.fetchWebsiteAnnouncements())
    calls.take()
    return r
  })
})
func('getAnnouncements', () => {
  kase('empty body is not cached', async () => {
    response = [200, '']
    return [await thrown(() => controller.getAnnouncements(principal(admin))), calls.take()]
  })
  kase('nothing read', async () => {
    db.komgaUserDao.insert(admin)
    db.komgaUserDao.insert(other)
    response = [200, feed]
    return [await controller.getAnnouncements(principal(admin)), calls.take()]
  })
  kase('cached, one read', async () => {
    db.komgaUserDao.saveAnnouncementIdsRead(admin, new Set(['https://komga.org/blog/a', 'unknown']))
    return [await controller.getAnnouncements(principal(admin)), calls.take()]
  })
  kase('other user', async () => (await controller.getAnnouncements(principal(other))).items.map((it) => it.komgaExtension))
})
func('markAnnouncementsRead', () => {
  kase('mark', async () => {
    controller.markAnnouncementsRead(principal(other), new Set(['https://komga.org/blog/b']))
    return [db.komgaUserDao.findAnnouncementIdsReadByUserId('U2'), (await controller.getAnnouncements(principal(other))).items.map((it) => it.komgaExtension)]
  })
  kase('mark again and empty', () => {
    controller.markAnnouncementsRead(principal(other), new Set(['https://komga.org/blog/b', 'https://komga.org/blog/a']))
    controller.markAnnouncementsRead(principal(other), new Set())
    return db.komgaUserDao.findAnnouncementIdsReadByUserId('U2')
  })
})
