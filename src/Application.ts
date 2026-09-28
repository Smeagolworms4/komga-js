// @port-of komga/src/main/kotlin/org/gotson/komga/Application.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { checkTempDirectory } from './infrastructure/util/TempDirectoryChecker.js'
import { runApplication } from './port/spring-boot-application.js'

// @SpringBootApplication @EnableScheduling
export class Application {}

export async function main(args: string[]): Promise<void> {
  checkTempDirectory()

  // PORT: System.setProperty("org.jooq.no-logo"/"org.jooq.no-tips") sans objet (pas de bannière jOOQ)

  await runApplication(args)
}
