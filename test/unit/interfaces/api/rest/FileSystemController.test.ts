// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/interfaces/api/rest/FileSystemControllerOracleTest.kt
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type DirectoryListingDto, DirectoryRequestDto, FileSystemController, type PathDto, toDto } from '../../../../../src/interfaces/api/rest/FileSystemController.js'
import { exceptionType, oracle, oracleBytes, tempDir } from '../../../oracle.js'

const { func, kase } = oracle('interfaces/api/rest/FileSystemController')

const controller = new FileSystemController()
let rootPath: string | null = null
/** Même arborescence côté Kotlin */
const root = (): string => {
  if (rootPath === null) {
    rootPath = join(tempDir(), 'fs')
    for (const it of ['Beta', 'alpha', 'Gamma dir', '.hidden', 'empty', 'Delta/sub']) mkdirSync(join(rootPath, it), { recursive: true })
    for (const it of ['b.cbz', 'A.cbz', 'c.txt', '.dot', 'alpha/inner.pdf']) writeFileSync(join(rootPath, it), oracleBytes(3))
  }
  return rootPath
}

const relS = (s: string | null) => (s === null ? null : s.replaceAll(dirname(root()), '<tmp>'))
const relP = (p: PathDto) => [p.type, relS(p.name), relS(p.path)]
const relD = (d: DirectoryListingDto) => [relS(d.parent), d.directories.map(relP), d.files.map(relP)]
const list = (path: string, showFiles = false) =>
  relD(controller.getDirectoryListing(new DirectoryRequestDto({ path: path.replace('<tmp>', dirname(root())), showFiles })))

func('getDirectoryListing', () => {
  kase('no path: roots', () => controller.getDirectoryListing(new DirectoryRequestDto()))
  kase('default request', () => controller.getDirectoryListing())
  kase('relative path', () => controller.getDirectoryListing(new DirectoryRequestDto({ path: 'relative/dir' })))
  kase('directories only', () => list('<tmp>/fs'))
  kase('with files', () => list('<tmp>/fs', true))
  kase('trailing slash', () => list('<tmp>/fs/', true))
  kase('file path lists its directory', () => list('<tmp>/fs/b.cbz', true))
  kase('missing file in existing directory', () => list('<tmp>/fs/missing.cbz'))
  kase('missing directory', () => exceptionType(() => list('<tmp>/fs/nope/deeper')))
  kase('missing directory message', () => {
    try {
      return list('<tmp>/fs/nope/deeper')
    } catch (e) {
      return (e as Error).message
    }
  })
  kase('empty directory', () => list('<tmp>/fs/empty', true))
  kase('dot segments', () => list('<tmp>/fs/alpha/../Beta', true))
  kase('hidden directory itself', () => list('<tmp>/fs/.hidden', true))
})
func('toDto', () => {
  kase('directory', () => relP(toDto(join(root(), 'Beta'))))
  kase('file', () => relP(toDto(join(root(), 'b.cbz'))))
  kase('missing', () => relP(toDto(join(root(), 'nothing'))))
  kase('root', () => toDto('/'))
  kase('relative', () => toDto('some/rel'))
  kase('exists check', () => existsSync(root()))
})
