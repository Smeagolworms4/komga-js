// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/search/MultiLingualNGramAnalyzer.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { LowerCaseFilter, type TokenStream, type Tokenizer, TokenStreamComponents } from '../../port/lucene/analysis.js'
import { ASCIIFoldingFilter } from '../../port/lucene/ASCIIFoldingFilter.js'
import { CJKBigramFilter } from '../../port/lucene/CJKBigramFilter.js'
import { CJKWidthFilter } from '../../port/lucene/CJKWidthFilter.js'
import { NGramTokenFilter } from '../../port/lucene/NGramTokenFilter.js'
import { StandardTokenizer } from '../../port/lucene/StandardTokenizer.js'
import { MultiLingualAnalyzer } from './MultiLingualAnalyzer.js'

export class MultiLingualNGramAnalyzer extends MultiLingualAnalyzer {
  constructor(
    private readonly minGram: number,
    private readonly maxGram: number,
    private readonly preserveOriginal: boolean,
  ) {
    super()
  }

  protected createComponents(fieldName: string): TokenStreamComponents {
    const source: Tokenizer = new StandardTokenizer()
    // run the widthfilter first before bigramming, it sometimes combines characters.
    let filter: TokenStream = new CJKWidthFilter(source)
    filter = new LowerCaseFilter(filter)
    filter = new CJKBigramFilter(filter)
    filter = new NGramTokenFilter(filter, this.minGram, this.maxGram, this.preserveOriginal)
    filter = new ASCIIFoldingFilter(filter)
    return new TokenStreamComponents(source, filter)
  }
}
