// Client HTTP des tests différentiels : envoie les requêtes de fixtures/requests.json et renvoie les réponses
// brutes (statut, en-têtes dans l'ordre reçu, corps). Partagé par l'enregistreur et les tests.
import { Agent, request } from 'node:http'

function multipartBody(spec) {
  const boundary = '------------------------komgatestboundary'
  const content = Buffer.alloc(spec.size)
  for (let i = 0; i < spec.size; i++) content[i] = (i * 31 + 7) % 251
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${spec.field}"; filename="${spec.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`)
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return { body: Buffer.concat([head, content, tail]), contentType: `multipart/form-data; boundary=${boundary}` }
}

export function send(base, r, agent) {
  return new Promise((resolve, reject) => {
    const url = new URL(r.path, base)
    const headers = { ...r.headers }
    let body = null
    if (r.body !== undefined) {
      if (typeof r.body === 'string') body = Buffer.from(r.body, 'utf8')
      else {
        const m = multipartBody(r.body.multipart)
        body = m.body
        headers['Content-Type'] = m.contentType
      }
      headers['Content-Length'] = String(body.length)
    }
    const req = request({ host: url.hostname, port: url.port, method: r.method, path: url.pathname + url.search, headers, agent }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          statusMessage: res.statusMessage,
          rawHeaders: res.rawHeaders,
          body: Buffer.concat(chunks).toString('base64'),
        }),
      )
      res.on('error', reject)
    })
    req.on('error', reject)
    if (body !== null) req.end(body)
    else req.end()
  })
}

export async function sendAll(base, requests) {
  const out = {}
  for (const r of requests) {
    const agent = new Agent({ keepAlive: true, maxSockets: 1 })
    try {
      out[r.id] = await send(base, r, agent)
    } finally {
      agent.destroy()
    }
  }
  return out
}
