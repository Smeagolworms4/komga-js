// @port-of komga/src/test/kotlin/org/gotson/komga/interfaces/api/rest/LibraryControllerTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, it } from 'vitest'
import { LibraryRepository } from '../../../../src/domain/persistence/LibraryRepository.js'
import { pathToUrl } from '../../../../src/port/java-net.js'
import { MediaType } from '../../../../src/port/spring-web.js'
import { makeLibrary } from '../../../domain/model/Utils.js'
import { containsString, hasItems } from '../../../support/hamcrest.js'
import { MockMvc, closeContext, mockMvcTest, withAnonymousUser, withMockUser } from '../../../support/mockmvc.js'
import { withMockCustomUser } from './MockSpringSecurity.js'

describe('LibraryControllerTest', () => {
  const ctx = mockMvcTest()
  const mockMvc = ctx.getBean(MockMvc)
  const libraryRepository = ctx.getBean(LibraryRepository)

  const route = '/api/v1/libraries'

  const library = makeLibrary({ path: 'file:/library1', id: '1' })

  // PORT: @TempDir -> répertoires temporaires supprimés en fin de fichier
  const tempDirs: string[] = []
  function tempDir(): string {
    const d = mkdtempSync(join(tmpdir(), 'junit-'))
    tempDirs.push(d)
    return d
  }

  afterAll(async () => {
    await closeContext(ctx)
    for (const d of tempDirs) rmSync(d, { recursive: true, force: true })
  })

  beforeEach(() => {
    libraryRepository.insert(library)
  })

  afterEach(() => {
    libraryRepository.deleteAll()
  })

  describe('AnonymousUser', () => {
    it(
      'given anonymous user when getAll then return unauthorized',
      withAnonymousUser(async () => {
        await mockMvc.get(route).andExpect((m) => m.status((s) => s.isUnauthorized()))
      }),
    )

    it(
      'given anonymous user when addOne then return unauthorized',
      withAnonymousUser(async () => {
        // language=JSON
        const jsonString = '{"name":"test", "root": "C:\\\\Temp"}'

        await mockMvc
          .post(route, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m) => m.status((s) => s.isUnauthorized()))
      }),
    )
  })

  describe('UserRoles', () => {
    it(
      'given user with access to all libraries when getAll then return ok',
      withMockCustomUser({}, async () => {
        await mockMvc.get(route).andExpect((m) => m.status((s) => s.isOk()))
      }),
    )

    it(
      'given user with USER role when addOne then return forbidden',
      withMockUser(async () => {
        // language=JSON
        const jsonString = '{"name":"test", "root": "C:\\\\Temp"}'

        await mockMvc
          .post(route, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m) => m.status((s) => s.isForbidden()))
      }),
    )
  })

  describe('LimitedUser', () => {
    it(
      'given user with access to a single library when getAll then only gets this library',
      withMockCustomUser({ sharedAllLibraries: false, sharedLibraries: ['1'] }, async () => {
        await mockMvc.get(route).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.length()', (j) => j.value(1))
          m.jsonPath('$[0].id', (j) => j.value(1))
        })
      }),
    )
  })

  describe('DtoRootSanitization', () => {
    it(
      'given regular user when getting libraries then root is hidden',
      withMockCustomUser({}, async () => {
        await mockMvc.get(route).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$[0].root', (j) => j.value(''))
        })

        await mockMvc.get(`${route}/${library.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.root', (j) => j.value(''))
        })
      }),
    )

    it(
      'given admin user when getting books then root is available',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        await mockMvc.get(route).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$[0].root', (j) => j.value(containsString('library1')))
        })

        await mockMvc.get(`${route}/${library.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.root', (j) => j.value(containsString('library1')))
        })
      }),
    )
  })

  describe('DirectoryExclusions', () => {
    it(
      'given library with exclusions when getting libraries then exclusions are present',
      withMockCustomUser({}, async () => {
        libraryRepository.update(library.copy({ scanDirectoryExclusions: new Set(['test', 'value']) }))

        await mockMvc.get(route).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$[0].scanDirectoryExclusions.length()', (j) => j.value(2))
          // UPSTREAM-BUG: `jsonPath(..) { hasItems(..) }` crée un Matcher hamcrest sans l'appliquer (aucune vérification)
          m.jsonPath('$[0].scanDirectoryExclusions', () => {
            hasItems('test', 'value')
          })
        })

        await mockMvc.get(`${route}/${library.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.scanDirectoryExclusions.length()', (j) => j.value(2))
          // UPSTREAM-BUG: Matcher créé sans être appliqué
          m.jsonPath('$.scanDirectoryExclusions', () => {
            hasItems('test', 'value')
          })
        })
      }),
    )

    it(
      'given library with exclusions when updating library then exclusions are updated',
      withMockCustomUser({ roles: ['ADMIN'] }, async () => {
        const tmp = tempDir()
        libraryRepository.update(library.copy({ root: pathToUrl(tmp), scanDirectoryExclusions: new Set(['test', 'value']) }))

        // language=JSON
        const jsonString = `{
  "scanDirectoryExclusions": ["updated"]
}`

        await mockMvc
          .patch(`${route}/${library.id}`, (r) => {
            r.contentType = MediaType.APPLICATION_JSON_VALUE
            r.content = jsonString
          })
          .andExpect((m) => {
            m.status((s) => s.isNoContent())
          })

        await mockMvc.get(`${route}/${library.id}`).andExpect((m) => {
          m.status((s) => s.isOk())
          m.jsonPath('$.scanDirectoryExclusions.length()', (j) => j.value(1))
          // UPSTREAM-BUG: Matcher créé sans être appliqué
          m.jsonPath('$.scanDirectoryExclusions', () => {
            hasItems('updated')
          })
        })
      }),
    )
  })
})
