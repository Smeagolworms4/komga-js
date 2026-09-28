// Support de test : équivalent minimal d'ArchUnit (com.tngtech.archunit) pour les tests d'architecture de Komga.
// Ce fichier n'a pas de jumeau Kotlin.
//
// PORT: ArchUnit analyse le bytecode des classes du paquet de `Application` ; ici on analyse le code source TS :
//  - « classe » = fichier `src/<p>/X.ts` (jumeau de `org.gotson.komga.<p>.X`), avec les noms des classes qu'il déclare ;
//  - paquet = répertoire : `src/domain/model/Book.ts` -> `org.gotson.komga.domain.model` ;
//  - dépendances = imports du fichier (`import`, `import type`, `export … from`, `import()`), les dépendances de type
//    comptant comme chez ArchUnit ;
//  - `src/port/**` (code de support, sans jumeau Kotlin) joue le rôle des bibliothèques : il n'est pas analysé, et une
//    dépendance vers lui est une dépendance vers une classe hors du paquet de Komga ;
//  - `ImportOption.DoNotIncludeTests` = fichiers de `src/`, `ImportOption.OnlyIncludeTests` = fichiers de `test/`.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const BASE_PACKAGE = 'org.gotson.komga'

export type JavaClass = {
  /** chemin relatif à la racine du projet */
  path: string
  /** nom du paquet Java équivalent */
  packageName: string
  /** nom simple (nom du fichier) */
  simpleName: string
  /** classes déclarées dans le fichier */
  declaredClasses: string[]
  /** source sans commentaires */
  code: string
  /** spécificateurs importés tels qu'écrits */
  importSpecifiers: string[]
  /** fichiers importés (chemins relatifs à la racine), résolus */
  dependencies: string[]
}

/** Retire les commentaires `/* … *\/` et `// …` (sans toucher aux `://` des URL) */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[\s;{}(),])\/\/.*$/gm, '$1')
}

const IMPORT_RE = /(?:\bimport\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?|\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+|\bimport\s*\(\s*)['"]([^'"]+)['"]/g

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir).sort()) {
    const f = join(dir, name)
    if (statSync(f).isDirectory()) walk(f, out)
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(f)
  }
}

function packageOf(rel: string): string {
  const parts = dirname(rel).split(sep).slice(1)
  return [BASE_PACKAGE, ...parts].join('.')
}

function resolveImport(fromAbs: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const abs = resolve(dirname(fromAbs), spec).replace(/\.js$/, '.ts')
  return relative(ROOT, abs)
}

/** `ClassFileImporter().importPackagesOf(Application::class)` avec l'option d'import donnée */
export function importClasses(option: 'DoNotIncludeTests' | 'OnlyIncludeTests'): JavaClass[] {
  const top = option === 'DoNotIncludeTests' ? 'src' : 'test'
  const files: string[] = []
  walk(join(ROOT, top), files)
  return files
    .map((abs) => relative(ROOT, abs))
    // src/flyway : migrations Kotlin du paquet `db.migration.sqlite`, hors du paquet de `Application`
    .filter((rel) => !(top === 'src' && (rel.startsWith(`src${sep}port${sep}`) || rel.startsWith(`src${sep}flyway${sep}`))))
    .map((rel) => {
      const abs = join(ROOT, rel)
      const code = stripComments(readFileSync(abs, 'utf8'))
      const importSpecifiers = [...code.matchAll(IMPORT_RE)].map((m) => m[1] as string)
      return {
        path: rel,
        packageName: packageOf(rel),
        simpleName: rel.split(sep).at(-1)!.replace(/(\.test)?\.ts$/, ''),
        declaredClasses: [...code.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1] as string),
        code,
        importSpecifiers,
        dependencies: importSpecifiers.map((s) => resolveImport(abs, s)).filter((d): d is string => d !== null),
      }
    })
}

/** Paquet d'un fichier de dépendance (`src/port/**` : hors du paquet de Komga) */
export function packageOfPath(rel: string): string | null {
  if (rel.startsWith(`src${sep}port${sep}`) || rel.startsWith(`src${sep}flyway${sep}`)) return null
  if (rel.startsWith(`src${sep}`)) return packageOf(rel)
  if (rel.startsWith(`test${sep}`)) return packageOf(rel)
  return null
}

/**
 * `PackageMatcher` d'ArchUnit : `..` = n'importe quelle suite de paquets, `*` = un nom de paquet,
 * `(*)` = un nom de paquet capturé.
 */
export class PackageMatcher {
  private readonly regex: RegExp

  constructor(readonly pattern: string) {
    let re = ''
    for (let i = 0; i < pattern.length; ) {
      if (pattern.startsWith('..', i)) {
        re += '\\.(?:.*\\.)?'
        i += 2
      } else if (pattern.startsWith('(*)', i)) {
        re += '(\\w+)'
        i += 3
      } else if (pattern[i] === '*') {
        re += '\\w+'
        i++
      } else if (pattern[i] === '.') {
        re += '\\.'
        i++
      } else {
        re += (pattern[i] as string).replace(/[$^\\/+?()[\]{}|]/g, '\\$&')
        i++
      }
    }
    // le nom de paquet est entouré de points pour que `..` en tête ou en fin corresponde à une suite vide
    if (!pattern.startsWith('..')) re = `\\.${re}`
    if (!pattern.endsWith('..')) re = `${re}\\.`
    this.regex = new RegExp(`^${re}$`)
  }

  matches(packageName: string): boolean {
    return this.regex.test(`.${packageName}.`)
  }

  /** premier groupe capturé, ou null */
  capture(packageName: string): string | null {
    return this.regex.exec(`.${packageName}.`)?.[1] ?? null
  }
}

export function resideInAnyPackage(packageName: string, ...patterns: string[]): boolean {
  return patterns.some((p) => new PackageMatcher(p).matches(packageName))
}

/** Violations d'une règle (description ArchUnit + détails), assertion faite par le test */
export class EvaluationResult {
  constructor(
    readonly description: string,
    readonly violations: string[],
  ) {}

  hasViolation(): boolean {
    return this.violations.length > 0
  }

  toString(): string {
    return `Architecture Violation - Rule '${this.description}' was violated (${this.violations.length} times):\n${this.violations.join('\n')}`
  }
}

/**
 * `noClasses().that().resideInAPackage(that).should().dependOnClassesThat().resideInAnyPackage(...targets)`
 */
export function noClassesThatResideInShouldDependOn(classes: JavaClass[], that: string, targets: string[]): EvaluationResult {
  const violations: string[] = []
  for (const c of classes) {
    if (!resideInAnyPackage(c.packageName, that)) continue
    for (const d of c.dependencies) {
      const pkg = packageOfPath(d)
      if (pkg !== null && resideInAnyPackage(pkg, ...targets)) violations.push(`${c.path} depends on ${d}`)
    }
  }
  return new EvaluationResult(
    `no classes that reside in a package '${that}' should depend on classes that reside in any package [${targets.map((t) => `'${t}'`).join(', ')}]`,
    violations,
  )
}

/** `slices().matching(pattern).should().notDependOnEachOther()` */
export function slicesShouldNotDependOnEachOther(classes: JavaClass[], pattern: string, namingSlices: string): EvaluationResult {
  const matcher = new PackageMatcher(pattern)
  const violations: string[] = []
  for (const c of classes) {
    const slice = matcher.capture(c.packageName)
    if (slice === null) continue
    for (const d of c.dependencies) {
      const pkg = packageOfPath(d)
      if (pkg === null) continue
      const other = matcher.capture(pkg)
      if (other !== null && other !== slice)
        violations.push(`${namingSlices.replace('$1', slice)} calls ${namingSlices.replace('$1', other)}: ${c.path} -> ${d}`)
    }
  }
  return new EvaluationResult(`slices matching '${pattern}' should not depend on each other`, violations)
}

/** Occurrences (fichier:ligne: texte) d'une expression dans le code des classes */
export function findUsages(classes: JavaClass[], regex: RegExp, accept: (c: JavaClass, line: string) => boolean = () => true): string[] {
  const out: string[] = []
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`)
  for (const c of classes)
    c.code.split('\n').forEach((line, i) => {
      re.lastIndex = 0
      if (re.test(line) && accept(c, line)) out.push(`${c.path}:${i + 1}: ${line.trim()}`)
    })
  return out
}

/** Imports (spécificateurs) correspondant à l'expression */
export function findImports(classes: JavaClass[], regex: RegExp): string[] {
  return classes.flatMap((c) => c.importSpecifiers.filter((s) => regex.test(s)).map((s) => `${c.path} imports ${s}`))
}
