// Support de portage : org.springframework.boot.ApplicationRunner / ApplicationArguments (DefaultApplicationArguments,
// SimpleCommandLineArgsParser). Les runners sont appelés par le démarrage de l'application après le rafraîchissement du
// contexte, avant ApplicationReadyEvent. Ce fichier n'a pas de jumeau Kotlin.
import { IllegalArgumentException } from './kotlin.js'
import type { ApplicationContext } from './spring.js'

/** `org.springframework.boot.ApplicationArguments` */
export class ApplicationArguments {
  private readonly optionArgs = new Map<string, string[]>()
  private readonly nonOptionArgs: string[] = []

  constructor(readonly sourceArgs: string[]) {
    // SimpleCommandLineArgsParser
    for (const arg of sourceArgs) {
      if (arg.startsWith('--')) {
        const optionText = arg.slice(2)
        const indexOfEqualsSign = optionText.indexOf('=')
        let optionName: string
        let optionValue: string | null = null
        if (indexOfEqualsSign > -1) {
          optionName = optionText.slice(0, indexOfEqualsSign)
          optionValue = optionText.slice(indexOfEqualsSign + 1)
        } else optionName = optionText
        if (optionName.length === 0) throw new IllegalArgumentException(`Invalid argument syntax: ${arg}`)
        const l = this.optionArgs.get(optionName) ?? []
        if (optionValue !== null) l.push(optionValue)
        this.optionArgs.set(optionName, l)
      } else this.nonOptionArgs.push(arg)
    }
  }

  getOptionNames(): Set<string> {
    return new Set(this.optionArgs.keys())
  }

  containsOption(name: string): boolean {
    return this.optionArgs.has(name)
  }

  /** valeurs de l'option (liste vide pour `--name` sans valeur), null si l'option est absente */
  getOptionValues(name: string): string[] | null {
    const l = this.optionArgs.get(name)
    return l === undefined ? null : [...l]
  }

  getNonOptionArgs(): string[] {
    return [...this.nonOptionArgs]
  }
}

/** `org.springframework.boot.ApplicationRunner` */
export abstract class ApplicationRunner {
  abstract run(args: ApplicationArguments): void
}

/** `SpringApplication.callRunners` : appelle les beans ApplicationRunner du contexte */
export function callRunners(context: ApplicationContext, args: ApplicationArguments): void {
  for (const runner of context.getBeansOfType(ApplicationRunner)) runner.run(args)
}
