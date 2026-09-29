// Chargement des sources TypeScript par Node sans compilation (tests qui lancent le serveur dans un processus enfant) :
// `node --experimental-transform-types --import ./test/support/ts-source-loader.mjs src/main.ts`.
// Les imports relatifs `./x.js` d'un fichier `.ts` sont résolus vers `./x.ts` quand il existe (comme tsc / Vitest).
import { register } from 'node:module'

register(
  'data:text/javascript,' +
    encodeURIComponent(`
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('.') || specifier.startsWith('file:')) && specifier.endsWith('.js') && context.parentURL?.endsWith('.ts')) {
    const ts = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
    if (existsSync(fileURLToPath(ts))) return nextResolve(ts.href, context)
  }
  return nextResolve(specifier, context)
}`),
)
