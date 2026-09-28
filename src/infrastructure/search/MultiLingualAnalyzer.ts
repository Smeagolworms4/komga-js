// @port-of komga/src/main/kotlin/org/gotson/komga/infrastructure/search/MultiLingualAnalyzer.kt@65981e600edb24944ffaae4818ff2716a5fa08dd
import { Analyzer, LowerCaseFilter, type TokenStream, type Tokenizer, TokenStreamComponents } from '../../port/lucene/analysis.js'
import { ASCIIFoldingFilter } from '../../port/lucene/ASCIIFoldingFilter.js'
import { CJKBigramFilter } from '../../port/lucene/CJKBigramFilter.js'
import { CJKWidthFilter } from '../../port/lucene/CJKWidthFilter.js'
import { StandardTokenizer } from '../../port/lucene/StandardTokenizer.js'

export class MultiLingualAnalyzer extends Analyzer {
  protected createComponents(fieldName: string): TokenStreamComponents {
    const source: Tokenizer = new StandardTokenizer()
    // run the widthfilter first before bigramming, it sometimes combines characters.
    let filter: TokenStream = new CJKWidthFilter(source)
    filter = new LowerCaseFilter(filter)
    filter = new CJKBigramFilter(filter)
    filter = new ASCIIFoldingFilter(filter)
    return new TokenStreamComponents(source, filter)
  }

  protected normalize(fieldName: string | null, input: TokenStream): TokenStream {
    let filter: TokenStream = new CJKWidthFilter(input)
    filter = new LowerCaseFilter(filter)
    filter = new ASCIIFoldingFilter(filter)
    return filter
  }
}
