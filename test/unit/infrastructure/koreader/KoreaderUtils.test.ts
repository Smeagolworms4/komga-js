// Oracle : komga/src/test/kotlin/org/gotson/komga/oracle/infrastructure/koreader/KoreaderUtilsOracleTest.kt
import { KoreaderUtils } from '../../../../src/infrastructure/koreader/KoreaderUtils.js'
import { oracle } from '../../oracle.js'

const { func, kase } = oracle('infrastructure/koreader/KoreaderUtils')

const progresses = [
  '/body/DocFragment[2]/body/section/p[3]/text().0',
  '/body/DocFragment[1].0',
  '/body/DocFragment[0].0',
  '/body/docfragment[12]/body/div.3',
  '/BODY/DOCFRAGMENT[7]',
  '/body/DocFragment/body/section/h2/text().0',
  '/body/docfragment/p',
  '/body/body/section/h2/text().0',
  '#_doc_fragment_1_ c37',
  '#_doc_fragment_0_',
  '#_DOC_FRAGMENT_5_x',
  '#_doc_fragment_x_',
  '/body/DocFragment[abc].0',
  '/body/DocFragment[].0',
  '/body/DocFragment[99999999999].0',
  '/body/DocFragment[2147483647].0',
  '#_doc_fragment_99999999999_',
  '/body/DocFragment[3]#_doc_fragment_9_',
  '#_doc_fragment_4_ /body/DocFragment/',
  'garbage',
  '',
  '12',
]

func('parseResourceIndexFromProgressString', () => {
  for (const it of progresses) kase(`[${it}]`, () => KoreaderUtils.parseResourceIndexFromProgressString(it))
})
