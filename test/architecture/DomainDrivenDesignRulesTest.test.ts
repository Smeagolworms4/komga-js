// @port-of komga/src/test/kotlin/org/gotson/komga/architecture/DomainDrivenDesignRulesTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { EvaluationResult, importClasses, noClassesThatResideInShouldDependOn, resideInAnyPackage } from '../support/archunit.js'

// @AnalyzeClasses(packagesOf = [Application::class], importOptions = [ImportOption.DoNotIncludeTests::class])
describe('DomainDrivenDesignRulesTest', () => {
  const classes = importClasses('DoNotIncludeTests')

  it('domainModelShouldNotAccessOtherPackages', () => {
    const result = noClassesThatResideInShouldDependOn(classes, '..domain..model..', [
      '..infrastructure..',
      '..interfaces..',
      '..domain.persistence..',
      '..domain.service..',
    ])
    expect(result.violations, result.toString()).toEqual([])
  })

  it('classesNamedControllerShouldBeInAnInterfacesPackage', () => {
    // classes().that().haveSimpleNameContaining("Controller").should().resideInAPackage("..interfaces..")
    const violations = classes.flatMap((c) =>
      c.declaredClasses.filter((n) => n.includes('Controller') && !resideInAnyPackage(c.packageName, '..interfaces..')).map((n) => `${n} (${c.path}) does not reside in a package '..interfaces..'`),
    )
    const result = new EvaluationResult("classes that have simple name containing 'Controller' should reside in a package '..interfaces..'", violations)
    expect(result.violations, result.toString()).toEqual([])
  })
})
