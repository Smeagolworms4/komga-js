// Point d'entrée exécutable (équivalent du Main-Class du jar Spring Boot). Ce fichier n'a pas de jumeau Kotlin.
import { main } from './Application.js'

await main(process.argv.slice(2))
