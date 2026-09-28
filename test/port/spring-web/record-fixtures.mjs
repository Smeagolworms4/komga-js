// Enregistre les réponses du Komga de référence (JVM) pour les requêtes de fixtures/requests.json.
// Usage : node test/port/spring-web/record-fixtures.mjs [http://localhost:25700]
// Les réponses (statut, en-têtes bruts dans l'ordre, corps en base64 ou empreinte SHA-256 au-delà de 8 Ko)
// sont écrites dans fixtures/reference.json.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sendAll } from './http-client.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const base = process.argv[2] ?? 'http://localhost:25700'
const requests = JSON.parse(readFileSync(join(here, 'fixtures/requests.json'), 'utf8'))
const responses = await sendAll(base, requests)
// corps volumineux : empreinte SHA-256 à la place du contenu
for (const r of Object.values(responses)) {
  const body = Buffer.from(r.body, 'base64')
  if (body.length > 8192) {
    r.bodySha256 = createHash('sha256').update(body).digest('hex')
    r.bodyLength = body.length
    delete r.body
  }
}
writeFileSync(join(here, 'fixtures/reference.json'), JSON.stringify(responses, null, 1))
console.log(`${Object.keys(responses).length} réponses enregistrées`)
