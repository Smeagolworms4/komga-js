// @port-of komga/src/test/kotlin/org/gotson/komga/infrastructure/kobo/KomgaSyncTokenGeneratorTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { afterAll, describe, expect, it } from 'vitest'
import { KomgaSyncToken } from '../../../src/domain/model/KomgaSyncToken.js'
import { KomgaSyncTokenGenerator } from '../../../src/infrastructure/kobo/KomgaSyncTokenGenerator.js'
import { closeContext, springBootTest } from '../../SpringBootTest.js'

describe('KomgaSyncTokenGeneratorTest', () => {
  const ctx = springBootTest()
  const tokenGenerator = ctx.getBean(KomgaSyncTokenGenerator)
  afterAll(() => closeContext(ctx))

  // PORT: Base64.getEncoder().withoutPadding()
  function encodeToBase64(token: string): string {
    return Buffer.from(token, 'utf8').toString('base64').replace(/=+$/, '')
  }

  it('given Kobo store token when getting token then it contains the kobo store token', () => {
    // given
    const koboToken = 'fake.token'

    // when
    const komgaToken = tokenGenerator.fromBase64(koboToken)

    // then
    expect(komgaToken.rawKoboSyncToken).toBe(koboToken)
  })

  it('given calibre web token when getting token then it contains the kobo store token', () => {
    // given
    const calibreWebToken = `{
  "data": {
    "archive_last_modified": -62135596800.0,
    "books_last_created": -62135596800.0,
    "books_last_modified": -62135596800.0,
    "raw_kobo_store_token": "fake.token",
    "reading_state_last_modified": -62135596800.0,
    "tags_last_modified": -62135596800.0
  },
  "version": "1-1-0"
}`

    // when
    const komgaToken = tokenGenerator.fromBase64(encodeToBase64(calibreWebToken))

    // then
    expect(komgaToken.rawKoboSyncToken).toBe('fake.token')
  })

  it('given Komga token when getting token then it contains the kobo store token', () => {
    // given
    const komgaToken = new KomgaSyncToken({ rawKoboSyncToken: 'fake.token' })

    // when
    const encodedToken = tokenGenerator.toBase64(komgaToken)
    const decodedToken = tokenGenerator.fromBase64(encodedToken)

    // then
    expect(decodedToken.rawKoboSyncToken).toBe('fake.token')
    expect(encodedToken.startsWith('KOMGA.')).toBe(true)
  })

  it('given unidentified token when getting token then it is empty', () => {
    // given
    const token = 'unrecognized'

    // when
    const komgaToken = tokenGenerator.fromBase64(token)

    // then
    expect(komgaToken.rawKoboSyncToken).toBe('')
  })
})
