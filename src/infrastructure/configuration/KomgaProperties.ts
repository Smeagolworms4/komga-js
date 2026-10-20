// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/configuration/KomgaProperties.kt@a9b59dbee73424d7f2e186b24b0905913f816709
import { Duration } from '@js-joda/core'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { NullPointerException } from '../../port/kotlin.js'
import { component } from '../../port/spring.js'
import { JournalMode } from '../../port/sqlite.js'
import { NotBlank, Positive, constraints } from '../../port/validation.js'

export class KomgaProperties {
  private makeDirs(): void {
    // PORT: Path(file).parent est null sans séparateur (NullPointerException) : l'exception interrompt le bloc
    const parent = (file: string): string => {
      const trimmed = file.replace(/\/+$/, '')
      if (!trimmed.includes('/')) throw new NullPointerException()
      return dirname(trimmed) || '/'
    }
    try {
      mkdirSync(parent(this.database.file), { recursive: true })
      mkdirSync(parent(this.tasksDb.file), { recursive: true })
    } catch {
      // ignoré
    }
  }

  pageHashing: number = 3

  epubDivinaLetterCountThreshold: number = 15

  oauth2AccountCreation: boolean = false

  oidcEmailVerification: boolean = true

  jdbcSessionEnabled: boolean = false

  database = new KomgaProperties.Database()

  tasksDb = new KomgaProperties.Database()

  sessionsDb = new KomgaProperties.Database()

  cors = new KomgaProperties.Cors()

  lucene = new KomgaProperties.Lucene()

  configDir: string | null = null

  kobo = new KomgaProperties.Kobo()

  readonly fonts = new KomgaProperties.Fonts()
}

export namespace KomgaProperties {
  export class Cors {
    allowedOrigins: string[] = []
  }

  export class Database {
    file: string = ''

    batchChunkSize: number = 1000

    poolSize: number | null = null

    maxPoolSize: number = 1

    journalMode: JournalMode | null = JournalMode.WAL

    busyTimeout: Duration | null = null

    pragmas: Map<string, string> = new Map()

    checkLocalFilesystem: boolean = true
  }

  export class Fonts {
    dataDirectory: string = ''
  }

  export class Lucene {
    dataDirectory: string = ''

    indexAnalyzer = new Lucene.IndexAnalyzer()

    commitDelay: Duration = Duration.ofSeconds(2)
  }

  export namespace Lucene {
    export class IndexAnalyzer {
      minGram: number = 3

      maxGram: number = 10

      preserveOriginal: boolean = true
    }
  }

  export class Kobo {
    syncItemLimit: number = 100

    kepubifyPath: string | null = null
  }
}

constraints(KomgaProperties, { pageHashing: [Positive()], epubDivinaLetterCountThreshold: [Positive()] })
constraints(KomgaProperties.Database, { file: [NotBlank()], batchChunkSize: [Positive()], poolSize: [Positive()], maxPoolSize: [Positive()] })
constraints(KomgaProperties.Fonts, { dataDirectory: [NotBlank()] })
constraints(KomgaProperties.Lucene, { dataDirectory: [NotBlank()] })
constraints(KomgaProperties.Lucene.IndexAnalyzer, { minGram: [Positive()], maxGram: [Positive()] })
constraints(KomgaProperties.Kobo, { syncItemLimit: [Positive()] })

// @Component @ConfigurationProperties(prefix = "komga") @Validated
component(KomgaProperties, {
  configurationProperties: {
    prefix: 'komga',
    types: {
      configDir: 'string',
      'database.poolSize': 'int',
      'database.journalMode': { enum: JournalMode },
      'database.busyTimeout': { duration: 'SECONDS' },
      'database.pragmas': 'map',
      'tasksDb.poolSize': 'int',
      'tasksDb.journalMode': { enum: JournalMode },
      'tasksDb.busyTimeout': { duration: 'SECONDS' },
      'tasksDb.pragmas': 'map',
      'sessionsDb.poolSize': 'int',
      'sessionsDb.journalMode': { enum: JournalMode },
      'sessionsDb.busyTimeout': { duration: 'SECONDS' },
      'sessionsDb.pragmas': 'map',
      'lucene.commitDelay': { duration: 'SECONDS' },
      'kobo.kepubifyPath': 'string',
    },
  },
  postConstruct: ['makeDirs'],
})
