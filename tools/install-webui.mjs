#!/usr/bin/env node
// Installe les interfaces web de Komga dans resources/public, comme les tâches Gradle de Komga
// (webuiCopyDist, webuiCopyIndex, nextuiCopyDist, nextuiCopyIndex de komga/build.gradle.kts) :
//  1. copie miroir de komga-webui/dist dans public/ ;
//  2. index.html de komga-webui avec les balises Thymeleaf injectées (th:src/th:href/th:content="@{/…}") ;
//  3. copie de next-ui/dist (sauf index.html) ;
//  4. index.html de next-ui, balises injectées, en public/index-next.html.
// Usage : node tools/install-webui.mjs <komga-webui/dist> <next-ui/dist>
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [webuiDist, nextuiDist] = process.argv.slice(2)
if (!webuiDist || !nextuiDist) {
  console.error('usage: install-webui.mjs <komga-webui/dist> <next-ui/dist>')
  process.exit(2)
}
const PUBLIC = new URL('../resources/public', import.meta.url).pathname

// filter { line -> line.replace("((?:src|content|href)=\")([\\w]*/.*?)(\")".toRegex()) { ... } }
const injectThymeleaf = (html) =>
  html
    .split('\n')
    .map((line) =>
      line.replace(/((?:src|content|href)=")([\w]*\/.*?)(")/g, (m, attr, path, end) => `${m} th:${attr}@{${path.startsWith('/') ? path : `/${path}`}}${end}`),
    )
    .join('\n')

rmSync(PUBLIC, { recursive: true, force: true })
cpSync(webuiDist, PUBLIC, { recursive: true })
writeFileSync(join(PUBLIC, 'index.html'), injectThymeleaf(readFileSync(join(webuiDist, 'index.html'), 'utf8')))
cpSync(nextuiDist, PUBLIC, { recursive: true, filter: (src) => src !== join(nextuiDist, 'index.html') })
if (existsSync(join(nextuiDist, 'index.html')))
  writeFileSync(join(PUBLIC, 'index-next.html'), injectThymeleaf(readFileSync(join(nextuiDist, 'index.html'), 'utf8')))
console.log(`interfaces web installées dans ${PUBLIC}`)
