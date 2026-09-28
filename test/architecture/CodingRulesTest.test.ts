// @port-of komga/src/test/kotlin/org/gotson/komga/architecture/CodingRulesTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { EvaluationResult, type JavaClass, findImports, findUsages, importClasses } from '../support/archunit.js'

// PORT: les règles de GeneralCodingRules d'ArchUnit portent sur des API de la JVM ; elles sont transposées à leurs
// équivalents Node / TypeScript (voir chaque test), analysées sur le code source (test/support/archunit.ts).

/** le fichier déclare-t-il une variable locale de ce nom (ex. `const process = spawnSync(...)`) ? */
function declaresLocal(c: JavaClass, name: string): boolean {
  return new RegExp(`\\b(?:const|let|var)\\s+${name}\\b|[(,]\\s*${name}\\s*[:,)]`).test(c.code)
}

// @AnalyzeClasses(packagesOf = [Application::class], importOptions = [ImportOption.DoNotIncludeTests::class])
describe('CodingRulesTest', () => {
  const classes = importClasses('DoNotIncludeTests')

  it('noAccessToStandardStreams', () => {
    // PORT: System.out / System.err / Throwable.printStackTrace() -> console.*, process.stdout, process.stderr, printStackTrace
    const violations = [
      ...findUsages(classes, /\bconsole\s*\.\s*\w+/),
      ...findUsages(classes, /\bprocess\s*\.\s*(?:stdout|stderr)\b/, (c) => !declaresLocal(c, 'process')),
      ...findUsages(classes, /\.printStackTrace\s*\(/),
    ]
    const result = new EvaluationResult('no classes should access standard streams', violations)
    expect(result.violations, result.toString()).toEqual([])
  })

  it('noGenericExceptions', () => {
    // PORT: création de java.lang.Throwable / Exception / RuntimeException -> new Error(…) (Throwable de JS) et
    // new Exception(…) / new RuntimeException(…) de port/kotlin.ts ; comme chez ArchUnit, l'appel du constructeur
    // parent par une sous-classe (super(…)) n'est pas compté
    const violations = findUsages(classes, /\bnew\s+(?:Error|Throwable|Exception|RuntimeException)\s*\(/)
    const result = new EvaluationResult('no classes should throw generic exceptions', violations)
    expect(result.violations, result.toString()).toEqual([])
  })

  it('noJodatime', () => {
    // PORT: org.joda.time -> paquets joda (@js-joda est le portage de java.time, autorisé)
    const violations = findImports(classes, /^(?:joda|joda-time|js-joda)(?:\/|$)/)
    const result = new EvaluationResult('no classes should use JodaTime', violations)
    expect(result.violations, result.toString()).toEqual([])
  })

  it('noJavaUtilLogging', () => {
    // PORT: java.util.logging -> journalisation intégrée de Node (module console, util.debuglog / debug) ; les
    // journaux passent par port/logging.ts (kotlin-logging)
    const violations = [...findImports(classes, /^(?:node:)?console$/), ...findUsages(classes, /\b(?:debuglog|debug)\s*\(\s*['"`]/, (c) => /from ['"](?:node:)?util['"]/.test(c.code))]
    const result = new EvaluationResult('no classes should use java.util.logging', violations)
    expect(result.violations, result.toString()).toEqual([])
  })

  it('noFieldInjection', () => {
    // PORT: @Autowired sur un champ -> bean obtenu du contexte (getBean) ailleurs que dans une dépendance déclarée
    // par component()/configuration() (`{ expression: (ctx) => ctx.getBean(…) }`, équivalent de @Value / @Qualifier
    // sur un paramètre du constructeur)
    const violations = findUsages(classes, /\bgetBean(?:sOfType)?\s*[<(]/, (_c, line) => !/\bexpression\s*:/.test(line))
    const result = new EvaluationResult('no classes should use field injection', violations)
    expect(result.violations, result.toString()).toEqual([])
  })
})

// @AnalyzeClasses(packagesOf = [Application::class], importOptions = [ImportOption.OnlyIncludeTests::class])
describe('TestCodingRulesTest', () => {
  const classes = importClasses('OnlyIncludeTests')

  it('noJunitAssertions', () => {
    // PORT: org.junit.jupiter.api.Assertions -> assertions de node:assert et assert de Vitest (on utilise expect, comme AssertJ)
    const violations = [
      ...findImports(classes, /^(?:node:)?assert(?:\/strict)?$/),
      ...findUsages(classes, /\bimport\s*\{[^}]*\bassert\b[^}]*\}\s*from\s*['"]vitest['"]/),
    ]
    const result = new EvaluationResult("no classes should depend on classes that have fully qualified name 'org.junit.jupiter.api.Assertions'", violations)
    expect(result.violations, result.toString()).toEqual([])
  })
})
