// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/ReleaseControllerOracleTest.kt
import { afterAll } from 'vitest'
import { ReleaseController } from '../../../../../src/interfaces/api/rest/ReleaseController.js'
import { oracle } from '../../../oracle.js'
import { Calls, fakeFetch, thrown, mapper } from './rest-oracle.js'

const { func, kase } = oracle('interfaces/api/rest/ReleaseController')

const calls = new Calls()
let response: [number, string] = [200, '[]']
afterAll(fakeFetch(calls, () => response))
const controller = new ReleaseController(mapper)

const releases = `[
      {"html_url":"https://github.com/gotson/komga/releases/tag/1.2.0","tag_name":"1.2.0","published_at":"2024-05-06T07:08:09Z","body":"## Changes\\n- a","prerelease":false,"extra":1},
      {"html_url":"https://github.com/gotson/komga/releases/tag/1.2.0-rc","tag_name":"1.2.0-rc","published_at":"2024-05-01T10:00:00+02:00","body":"","prerelease":true}
    ]`

func('fetchGitHubReleases', () => {
  kase('ok', async () => {
    response = [200, releases]
    return [await controller.fetchGitHubReleases(), calls.take()]
  })
  kase('empty body', async () => {
    response = [200, '']
    return [await controller.fetchGitHubReleases(), calls.take()]
  })
  kase('invalid json', async () => {
    response = [200, '[{']
    return [await thrown(() => controller.fetchGitHubReleases()), calls.take()]
  })
  kase('empty list', async () => {
    response = [200, '[]']
    return await controller.fetchGitHubReleases()
  })
  kase('not found', async () => {
    response = [404, '{}']
    return [await thrown(() => controller.fetchGitHubReleases()), calls.take()]
  })
  kase('server error', async () => {
    response = [500, '']
    return await thrown(() => controller.fetchGitHubReleases())
  })
})
func('getReleases', () => {
  kase('error is not cached', async () => {
    response = [503, '']
    return [await thrown(() => controller.getReleases()), calls.take()]
  })
  kase('fetched', async () => {
    response = [200, releases]
    return [await controller.getReleases(), calls.take()]
  })
  kase('cached', async () => {
    response = [200, '[]']
    return [await controller.getReleases(), calls.take()]
  })
  kase('new controller, empty list', async () => {
    response = [200, '[]']
    return [await new ReleaseController(mapper).getReleases(), calls.take()]
  })
})
