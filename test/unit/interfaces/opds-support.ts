// Miroir de OpdsSupport (oracle/interfaces/OpdsSupport.kt) : sérialisation des flux OPDS.
import { Dimension } from '../../../src/domain/model/Dimension.js'
import { ThumbnailBook } from '../../../src/domain/model/ThumbnailBook.js'
import { MappingJackson2XmlHttpMessageConverterConfiguration } from '../../../src/infrastructure/xml/MappingJackson2XmlHttpMessageConverterConfiguration.js'
import { Jackson2ObjectMapperBuilder } from '../../../src/port/jackson-xml.js'
import { unzipSync } from './unzip.js'
import type { OracleDb } from '../db.js'
import { mapper, stableText } from '../web-oracle.js'
import { CBZ } from './data.js'

let xmlMapper: { writeValueAsString(v: unknown): string } | null = null

/** flux OPDS 1.2 tel qu'envoyé par Komga (XML), dates « maintenant » neutralisées */
export function xml(v: unknown): string {
  xmlMapper ??= new MappingJackson2XmlHttpMessageConverterConfiguration().mappingJackson2XmlHttpMessageConverter(new Jackson2ObjectMapperBuilder()).objectMapper
  return stableText(xmlMapper.writeValueAsString(v))
}

/** flux OPDS 2 tel qu'envoyé par Komga (JSON), dates « maintenant » neutralisées */
export function json(v: unknown): string {
  return stableText(mapper().writeValueAsString(v))
}

/** p2.jpg de CBZ */
export const jpeg = (): Uint8Array => unzipSync(Buffer.from(CBZ, 'base64')).get('p2.jpg')!

/** miniature générée TB7 (octets en base) pour B7 */
export function thumbnails(db: OracleDb): void {
  const bytes = jpeg()
  db.thumbnailBookDao.insert(
    new ThumbnailBook({ thumbnail: bytes, type: ThumbnailBook.Type.GENERATED, mediaType: 'image/jpeg', fileSize: bytes.length, dimension: new Dimension({ width: 2, height: 3 }), selected: true, id: 'TB7', bookId: 'B7' }),
  )
}
