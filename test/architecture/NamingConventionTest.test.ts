// @port-of komga/src/test/kotlin/org/gotson/komga/architecture/NamingConventionTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { EvaluationResult, importClasses, resideInAnyPackage } from '../support/archunit.js'

// @AnalyzeClasses(packagesOf = [Application::class], importOptions = [ImportOption.DoNotIncludeTests::class])
describe('NamingConventionTest', () => {
  const classes = importClasses('DoNotIncludeTests')

  it('servicesShouldNotHaveNamesContainingServiceOrManager', () => {
    const violations = classes
      .filter((c) => resideInAnyPackage(c.packageName, '..domain..service..', '..application..service..'))
      .flatMap((c) =>
        c.declaredClasses
          .filter((n) => n.includes('service') || n.includes('Service') || n.includes('manager') || n.includes('Manager'))
          .map((n) => `${n} (${c.path}) has simple name containing a forbidden word`),
      )
    const result = new EvaluationResult(
      "no classes that reside in any package ['..domain..service..', '..application..service..'] should have simple name containing 'service' or should have simple name containing 'Service' or should have simple name containing 'manager' or should have simple name containing 'Manager', because it doesn't bear any intent",
      violations,
    )
    expect(result.violations, result.toString()).toEqual([])
  })

  it('controllersShouldBeSuffixed', () => {
    // PORT: @RestController / @Controller = enregistrement par restController(X, …) (port/spring-web.ts) en fin de fichier jumeau
    const violations = classes.flatMap((c) =>
      [...c.code.matchAll(/^\s*restController\(\s*([A-Za-z_$][\w$]*)\s*,/gm)]
        .map((m) => m[1] as string)
        .filter((n) => !n.endsWith('Controller'))
        .map((n) => `${n} (${c.path}) does not have simple name ending with 'Controller'`),
    )
    const result = new EvaluationResult(
      "classes that are annotated with @RestController or are annotated with @Controller should have simple name ending with 'Controller'",
      violations,
    )
    expect(result.violations, result.toString()).toEqual([])
  })
})
