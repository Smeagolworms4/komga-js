// Support de portage : emplacement des ressources (équivalent du classpath). Ce fichier n'a pas de jumeau Kotlin.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

let dir: string | null = null

/** Répertoire `resources/` (copie de src/main/resources et src/flyway/resources de Komga) */
export function resourcesDir(): string {
  if (dir) return dir
  const here = dirname(fileURLToPath(import.meta.url))
  for (const p of [join(here, '../../resources'), join(here, '../../../resources'), join(process.cwd(), 'resources')])
    if (existsSync(join(p, 'application.yml'))) return (dir = p)
  throw new Error('resources/application.yml introuvable')
}
