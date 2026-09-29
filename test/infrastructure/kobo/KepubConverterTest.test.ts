// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/kobo/KepubConverterTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
// PORT: équivalent du scan de composants : modules des beans nécessaires
import '../../../src/infrastructure/jooq/main/ServerSettingsDao.js'
import '../../../src/infrastructure/jooq/main/BookProjectionDao.js'
import '../../../src/infrastructure/configuration/KomgaSettingsProvider.js'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BookWithMedia } from '../../../src/domain/model/BookWithMedia.js'
import { Media } from '../../../src/domain/model/Media.js'
import { MediaType } from '../../../src/domain/model/MediaType.js'
import { KepubConverter } from '../../../src/infrastructure/kobo/KepubConverter.js'
import { pathToUrl } from '../../../src/port/java-net.js'
import { IllegalArgumentException } from '../../../src/port/kotlin.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'
import { makeBook } from '../../domain/model/Utils.js'

async function catchThrowable(block: () => unknown): Promise<unknown> {
  try {
    await block()
    return null
  } catch (e) {
    return e
  }
}

describe('KepubConverterTest', () => {
  const ctx = springBootTest()
  const kepubConverter = ctx.getBean(KepubConverter)

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

  beforeAll(() => {
    const tmpDir = tempDir()
    const it = join(tmpDir, 'kepubify')
    writeFileSync(it, '')
    chmodSync(it, 0o755)
    kepubConverter.configureKepubify(it)
  })

  it('given kepub book when converting then IllegalArgument is thrown', async () => {
    const dir = tempDir()
    // given
    const book = makeBook('book', { url: pathToUrl(join(dir, 'book.epub')) })
    const media = new Media({ mediaType: MediaType.EPUB.type, epubIsKepub: true })

    // when
    const thrownBy = await catchThrowable(() => kepubConverter.convertEpubToKepub(new BookWithMedia({ book: book, media: media }), dir))

    // then
    expect(thrownBy).toBeInstanceOf(IllegalArgumentException)
  })

  it('given non-EPUB book when converting then IllegalArgument is thrown', async () => {
    const dir = tempDir()
    // given
    const book = makeBook('book', { url: pathToUrl(join(dir, 'book.epub')) })
    const media = new Media({ mediaType: MediaType.ZIP.type })

    // when
    const thrownBy = await catchThrowable(() => kepubConverter.convertEpubToKepub(new BookWithMedia({ book: book, media: media }), dir))

    // then
    expect(thrownBy).toBeInstanceOf(IllegalArgumentException)
  })

  it('given non-existent file when converting then IllegalArgument is thrown', async () => {
    const dir = tempDir()
    // given
    const book = makeBook('book', { url: pathToUrl(join(dir, 'book.epub')) })
    const media = new Media({ mediaType: MediaType.EPUB.type })

    // when
    const thrownBy = await catchThrowable(() => kepubConverter.convertEpubToKepub(new BookWithMedia({ book: book, media: media }), dir))

    // then
    expect(thrownBy).toBeInstanceOf(IllegalArgumentException)
  })

  it('given existing book file and dummy kepubify when converting then conversion fails', async () => {
    const dir = tempDir()
    // given
    // PORT: Files.createTempFile(dir, "book", ".epub")
    const source = join(dir, `book${Date.now()}.epub`)
    writeFileSync(source, '')

    const book = makeBook('book', { url: pathToUrl(source) })
    const media = new Media({ mediaType: MediaType.EPUB.type })

    // when
    const result = await kepubConverter.convertEpubToKepub(new BookWithMedia({ book: book, media: media }), dir)

    // then
    expect(result).toBeNull()
  })
})
