#!/usr/bin/env node
// Équivalent du générateur de code jOOQ : produit src/port/jooq/generated/<catalogue>/Tables.ts
// à partir des classes Java générées par jOOQ dans le build de Komga
// (upstream/komga/build/generated-src/jooq/<catalogue>, produites par `./gradlew :komga:generateJooq`).
// Tables, colonnes (nom, type SQL, ordre), clés primaires et étrangères, records (propriétés camelCase).
//
// Usage : node tools/gen-jooq.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const REF = readFileSync(join(ROOT, 'UPSTREAM_REF'), 'utf8').trim()

const TS_TYPES = {
  VARCHAR: 'string',
  CLOB: 'string',
  BOOLEAN: 'boolean',
  INTEGER: 'number',
  BIGINT: 'number',
  REAL: 'number',
  DOUBLE: 'number',
  BLOB: 'Uint8Array',
  LOCALDATETIME: 'LocalDateTime',
  LOCALDATE: 'LocalDate',
}

function generate(catalog) {
  const base = join(ROOT, 'upstream/komga/build/generated-src/jooq', catalog, 'org/gotson/komga/jooq', catalog)
  if (!existsSync(base)) throw new Error(`${base} introuvable : lancer ./gradlew :komga:generateJooq dans upstream`)
  const tables = []
  for (const f of readdirSync(join(base, 'tables')).filter((f) => f.endsWith('.java')).sort()) {
    const src = readFileSync(join(base, 'tables', f), 'utf8')
    const cls = f.slice(0, -5)
    const constant = /public static final \w+ (\w+) = new \w+\(\);/.exec(src)?.[1]
    const sqlName = new RegExp(`this\\(DSL\\.name\\("([^"]+)"\\), null\\)`).exec(src)?.[1]
    if (!constant || !sqlName) throw new Error(`table ${f} non reconnue`)
    const fields = [...src.matchAll(/public final TableField<\w+, [^>]+> (\w+) = createField\(DSL\.name\("([^"]+)"\), SQLDataType\.(\w+)/g)].map((m) => ({
      prop: m[1],
      name: m[2],
      type: m[3],
    }))
    for (const fl of fields) if (!TS_TYPES[fl.type]) throw new Error(`type ${fl.type} non géré (${cls}.${fl.name})`)
    const pk = /getPrimaryKey\(\) \{\s*return Keys\.(\w+);/.exec(src)?.[1] ?? null
    // record : propriétés dans l'ordre des index
    const rsrc = readFileSync(join(base, 'tables/records', `${cls}Record.java`), 'utf8')
    const props = [...rsrc.matchAll(/public \S+ get(\w+)\(\) \{\s*return \([^)]+\) get\((\d+)\);/g)].map((m) => ({
      prop: m[1][0].toLowerCase() + m[1].slice(1),
      index: Number(m[2]),
    }))
    tables.push({ cls, constant, sqlName, fields, pk, props })
  }
  const keysSrc = readFileSync(join(base, 'Keys.java'), 'utf8')
  const lastPart = (s) => s.trim().split('.').pop()
  const uniques = [...keysSrc.matchAll(/(\w+) = Internal\.createUniqueKey\((\w+)\.(\w+), DSL\.name\("([^"]+)"\), new TableField\[\] \{ ([^}]+) \}/g)].map((m) => ({
    key: m[1],
    table: m[3],
    name: m[4],
    fields: m[5].split(',').map(lastPart),
  }))
  const fks = [
    ...keysSrc.matchAll(
      /(\w+) = Internal\.createForeignKey\((\w+)\.(\w+), DSL\.name\("([^"]+)"\), new TableField\[\] \{ ([^}]+) \}, Keys\.(\w+), new TableField\[\] \{ ([^}]+) \}/g,
    ),
  ].map((m) => ({ key: m[1], table: m[3], name: m[4], fields: m[5].split(',').map(lastPart), ref: m[6], refFields: m[7].split(',').map(lastPart) }))

  const byConst = new Map(tables.map((t) => [t.constant, t]))
  let out = `// Généré par tools/gen-jooq.mjs depuis le code jOOQ de Komga (${REF}), catalogue "${catalog}". Ne pas modifier.
// Équivalent de org.gotson.komga.jooq.${catalog}.{Tables, Keys, tables.*, tables.records.*}
/* eslint-disable */
import type { LocalDate, LocalDateTime } from '@js-joda/core'
import { ForeignKey, Table, TableRecordImpl, UniqueKey, registerRecordClass } from '../../core.js'
import { SQLDataType } from '../../types.js'

`
  for (const t of tables) {
    const pkKey = uniques.find((u) => u.key === t.pk)
    const myFks = fks.filter((f) => f.table === t.constant)
    out += `export class ${t.cls} extends Table<${t.cls}Record> {\n`
    for (const f of t.fields) out += `  readonly ${f.prop} = this.createField<${TS_TYPES[f.type]}>('${f.name}', SQLDataType.${f.type})\n`
    out += `\n  constructor(alias: string | null = null) {\n    super('${t.sqlName}', alias)\n  }\n`
    if (pkKey) out += `\n  getPrimaryKey(): UniqueKey<${t.cls}Record> | null {\n    return Keys.${pkKey.key} as UniqueKey<${t.cls}Record>\n  }\n`
    if (myFks.length) out += `\n  getReferences(): ForeignKey<${t.cls}Record, unknown>[] {\n    return [${myFks.map((f) => `Keys.${f.key}`).join(', ')}] as ForeignKey<${t.cls}Record, unknown>[]\n  }\n`
    out += `}\n\n`
    out += `export class ${t.cls}Record extends TableRecordImpl<${t.cls}Record> {\n`
    for (const p of t.props) {
      const f = t.fields[p.index]
      const ty = TS_TYPES[f.type]
      out += `  get ${p.prop}(): ${ty} {\n    return this.values[${p.index}] as ${ty}\n  }\n  set ${p.prop}(v: ${ty}) {\n    this.values[${p.index}] = v\n  }\n`
    }
    out += `}\nregisterRecordClass(${t.cls}, ${t.cls}Record as never)\n\n`
  }
  out += `export const Tables = {\n${tables.map((t) => `  ${t.constant}: new ${t.cls}(),`).join('\n')}\n}\n\n`
  for (const t of tables) out += `export const ${t.constant} = Tables.${t.constant}\n`
  out += `\n// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const Keys: { [k: string]: any } = {\n`
  for (const u of uniques) out += `  ${u.key}: new UniqueKey(Tables.${u.table}, '${u.name}', ${JSON.stringify(u.fields)}),\n`
  out += `}\n`
  out += `const FKS = {\n`
  for (const f of fks) {
    if (!byConst.has(f.table)) throw new Error(`FK ${f.key} : table inconnue`)
    out += `  ${f.key}: new ForeignKey(Tables.${f.table}, '${f.name}', ${JSON.stringify(f.fields)}, Keys.${f.ref} as UniqueKey<unknown>, ${JSON.stringify(f.refFields)}),\n`
  }
  out += `}\nObject.assign(Keys, FKS)\n`
  const dir = join(ROOT, 'src/port/jooq/generated', catalog)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'Tables.ts'), out)
  console.log(`${catalog}: ${tables.length} tables, ${tables.reduce((n, t) => n + t.fields.length, 0)} colonnes, ${uniques.length} clés uniques, ${fks.length} clés étrangères`)
}

generate('main')
generate('tasks')
