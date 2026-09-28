// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/security/OpdsAuthenticationEntryPointOracleTest.kt
import { OpdsAuthenticationEntryPoint } from '../../../../src/infrastructure/security/OpdsAuthenticationEntryPoint.js'
import { BadCredentialsException } from '../../../../src/port/spring-security.js'
import { OracleDb } from '../../db.js'
import { oracle } from '../../oracle.js'
import { describeResponse, mapper, request, response, withRequest } from '../../web-oracle.js'
import { InterfacesServices } from '../../interfaces/services.js'

const { func, kase } = oracle('infrastructure/security/OpdsAuthenticationEntryPoint')

const services = new InterfacesServices(new OracleDb())
let instance: OpdsAuthenticationEntryPoint | null = null
const entryPoint = () => (instance ??= new OpdsAuthenticationEntryPoint(services.opdsGenerator, mapper()))

async function commence({ host = 'localhost', port = 25600, scheme = 'http', contextPath = '' }: { host?: string; port?: number; scheme?: string; contextPath?: string } = {}): Promise<unknown[]> {
  const req = request({ uri: `${contextPath}/opds/v2/catalog`, host, port, scheme, contextPath })
  const res = response()
  await withRequest(req, () => entryPoint().commence(req, res, new BadCredentialsException('Bad credentials')))
  return describeResponse(res)
}

func('commence', () => {
  kase('default', () => commence())
  kase('https default port', () => commence({ host: 'komga.example.org', port: 443, scheme: 'https' }))
  kase('context path', () => commence({ contextPath: '/komga' }))
})
