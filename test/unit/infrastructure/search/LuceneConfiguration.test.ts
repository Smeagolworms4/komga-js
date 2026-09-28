// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/search/LuceneConfigurationOracleTest.kt
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { KomgaProperties } from '../../../../src/infrastructure/configuration/KomgaProperties.js'
import { LuceneConfiguration } from '../../../../src/infrastructure/search/LuceneConfiguration.js'
import { toDocument } from '../../../../src/infrastructure/search/LuceneEntity.js'
import { Term } from '../../../../src/port/lucene/document.js'
import { DirectoryReader } from '../../../../src/port/lucene/index.js'
import { TermQuery } from '../../../../src/port/lucene/search.js'
import { oracle, tempDir } from '../../oracle.js'
import { Index, books, collections, readLists, tokens } from './searchSamples.js'

const { func, kase } = oracle('infrastructure/search/LuceneConfiguration')

function configuration(block: (p: KomgaProperties) => void = () => {}): LuceneConfiguration {
  const p = new KomgaProperties()
  block(p)
  return new LuceneConfiguration(p)
}

const samples = ['Batman: Year One', '進撃の巨人', 'Ｆｕｌｌｗｉｄｔｈ', "L'Été", 'a', 'ab', 'abcdefghijklmnop']

func('indexAnalyzer', () => {
  for (const t of samples) kase(`default settings '${t}'`, () => tokens(configuration().indexAnalyzer(), t))
  for (const t of samples) {
    kase(`1-2 without original '${t}'`, () =>
      tokens(
        configuration((p) => {
          p.lucene.indexAnalyzer.minGram = 1
          p.lucene.indexAnalyzer.maxGram = 2
          p.lucene.indexAnalyzer.preserveOriginal = false
        }).indexAnalyzer(),
        t,
      ),
    )
  }
})

func('searchAnalyzer', () => {
  for (const t of samples) kase(`'${t}'`, () => tokens(configuration().searchAnalyzer(), t))
})

func('memoryDirectory', () => {
  kase('new directory has no index', () => DirectoryReader.indexExists(configuration().memoryDirectory()))
  kase('two directories are distinct', () => {
    const c = configuration()
    return c.memoryDirectory() !== c.memoryDirectory()
  })
})

func('diskDirectory', () => {
  kase('new directory has no index', () => {
    const dir = join(tempDir(), 'lucene-empty')
    mkdirSync(dir, { recursive: true })
    return DirectoryReader.indexExists(configuration((p) => (p.lucene.dataDirectory = dir)).diskDirectory())
  })
  kase('index written then reopened', () => {
    const dir = join(tempDir(), 'lucene-disk')
    mkdirSync(dir, { recursive: true })
    const conf = configuration((p) => (p.lucene.dataDirectory = dir))
    const directory = conf.diskDirectory()
    const writer = conf.indexWriter(directory, conf.indexAnalyzer())
    writer.addDocuments(books.map(toDocument))
    writer.commit()
    writer.close()
    directory.close()
    const index = new Index(conf.diskDirectory())
    return [index.helper.indexExists(), index.searchAll()]
  })
})

func('indexWriter', () => {
  kase('documents visible after commit', () => {
    const conf = configuration()
    const directory = conf.memoryDirectory()
    const writer = conf.indexWriter(directory, conf.indexAnalyzer())
    const before = DirectoryReader.indexExists(directory)
    writer.addDocument(toDocument(collections[0]!))
    writer.commit()
    const manager = conf.searcherManager(writer)
    const searcher = manager.acquire()
    return [before, DirectoryReader.indexExists(directory), searcher.search(new TermQuery(new Term('type', 'collection')), 100).scoreDocs.length]
  })
})

func('searcherManager', () => {
  kase('refresh after commit', () => {
    const conf = configuration()
    const writer = conf.indexWriter(conf.memoryDirectory(), conf.indexAnalyzer())
    const manager = conf.searcherManager(writer)
    const query = new TermQuery(new Term('type', 'readlist'))
    const counts = [manager.acquire().search(query, 100).scoreDocs.length]
    writer.addDocuments(readLists.map(toDocument))
    counts.push(manager.acquire().search(query, 100).scoreDocs.length)
    writer.commit()
    counts.push(manager.acquire().search(query, 100).scoreDocs.length)
    manager.maybeRefreshBlocking()
    counts.push(manager.acquire().search(query, 100).scoreDocs.length)
    return counts
  })
})
