// @port-of komga/src/test/kotlin/org/gotson/komga/architecture/SlicesIsolationRulesTest.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { describe, expect, it } from 'vitest'
import { importClasses, slicesShouldNotDependOnEachOther } from '../support/archunit.js'

// @AnalyzeClasses(packagesOf = [Application::class], importOptions = [ImportOption.DoNotIncludeTests::class])
describe('SlicesIsolationRulesTest', () => {
  const classes = importClasses('DoNotIncludeTests')

  it('interfacesShouldOnlyUseTheirOwnSlice', () => {
    // slices().matching("..interfaces.(*)..").namingSlices("Interface $1").as("Interfaces").should().notDependOnEachOther()
    const result = slicesShouldNotDependOnEachOther(classes, '..interfaces.(*)..', 'Interface $1')
    expect(result.violations, result.toString()).toEqual([])
  })
})
