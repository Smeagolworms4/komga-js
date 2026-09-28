// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/mediacontainer/epub/EpubOracleTest.kt
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { epub, getPackageFileContent, getPackagePath } from '../../../../../src/infrastructure/mediacontainer/epub/Epub.js'
import { use } from '../../../../../src/infrastructure/util/ZipFileUtils.js'
import { ZipFile } from '../../../../../src/port/commons-compress.js'
import { exceptionType, oracle, tempDir } from '../../../oracle.js'
import { epubFiles, pathless } from '../samples.js'

const { func, kase } = oracle('infrastructure/mediacontainer/epub/Epub')

const synthetic = join(tempDir(), 'synthetic')
mkdirSync(synthetic, { recursive: true })
const files = epubFiles(synthetic)

func('epub', () => {
  for (const [label, p] of files) {
    kase(label, () =>
      pathless(p, () =>
        epub(p, ({ opfDoc, opfDir, manifest }) => [opfDir, manifest, opfDoc.select('*|spine > *|itemref').map((it) => it.attr('idref'))]),
      ),
    )
  }
  kase('not a zip', () => {
    const p = join(tempDir(), 'text.epub')
    writeFileSync(p, 'hello')
    return pathless(p, () => epub(p, (it) => it.opfDir))
  })
  kase('missing file', () => exceptionType(() => epub(join(tempDir(), 'missing.epub'), (it) => it.opfDir)))
})

func('getPackagePath', () => {
  for (const [label, p] of files) kase(label, () => pathless(p, () => use(ZipFile.builder().setPath(p), (it) => getPackagePath(it))))
})

func('getPackageFileContent', () => {
  for (const [label, p] of files) kase(label, () => pathless(p, () => getPackageFileContent(p)))
  kase('not a zip', () => {
    const p = join(tempDir(), 'text2.epub')
    writeFileSync(p, 'hello')
    return pathless(p, () => getPackageFileContent(p))
  })
})
