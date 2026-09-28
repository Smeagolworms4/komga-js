// Corpus de chaînes pour le test différentiel des analyseurs (déterministe)
import { writeFileSync } from 'node:fs'
let seed = 42
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000)
const pick = (a) => a[Math.floor(rnd() * a.length)]
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i))

const hand = [
  'The incredible adventures of Batman, the man who is also a bat!',
  'Éric èl rojo', '9782413016878', 'J', '[不道德公會][河添太一 ][東立]Vol.04-搬运', '不道德公會河添太一東立搬运',
  '探偵はもう、死んでいる。', 'ワンパンマン', '고교생을 환불해 주세요', '',
  "L'Arabe du futur", "don't stop believin'", "O'Neil's comics", 'rock’n’roll', 'Ǆemal Ǉubljana', 'İstanbul ıi İI',
  'Straße GROSSE ß ẞ', 'Æsir œuvre Øresund þorn ðing', 'naïve café résumé coöperate', 'Ångström Škoda Łódź Ÿ',
  'https://komga.org/docs/guides/search?q=batman&x=1', 'user@example.com', 'www.example.co.uk/path', 'ISBN 978-2-413-01687-8', '978-2-413-01687-8',
  '0-306-40615-2', 'ISBN-10: 2-266-11156-6', '3.14159 1,000,000 1.2.3.4 v2.0.1 12:30 2021-05-06', '50% off! $19.99 €5 ¥100',
  'ＡＢＣ　ｄｅｆ　１２３', 'ｶﾞｷﾞｸﾞｹﾞｺﾞ ﾊﾟﾋﾟﾌﾟﾍﾟﾎﾟ ﾜﾝﾊﾟﾝﾏﾝ ｳﾞ', 'ﾃｽﾄ ﾃﾞｰﾀ', 'Ｃ＋＋ ＃１', '（株）ＫＡＤＯＫＡＷＡ',
  'สวัสดีครับ ภาษาไทย', 'ພາສາລາວ', 'မြန်မာ', 'ភាសាខ្មែរ', 'Привет, мир! ЁЛКА', 'Γειά σου Κόσμε ΣΊΣΥΦΟΣ', 'שלום עולם', 'مرحبا بالعالم', 'नमस्ते दुनिया',
  '😀 😃 👍🏽 👨‍👩‍👧‍👦 🇫🇷🇯🇵 ❤️ ☕ 1️⃣ #️⃣ ©️ ™', 'Batman😀Robin', '😀😀😀', '🏳️‍🌈 flag', '𠀋𠀌 𡈽 𪚲', '𝓑𝓪𝓽𝓶𝓪𝓷 𝔹𝕒𝕥',
  'ﬁnance ﬂoor ǅ ǲ', 'Ⅻ Ⅳ ⅳ ① ② ⑴ ⒜', '½ ¼ ¾ ² ³ ¹', '“quoted” ‘single’ «guillemets» „German“', '— – ‐ ‑ ‒ ― ⁃',
  'a.b.c A.B.C. U.S.A.', 'e.g. i.e. etc.', 'foo_bar foo-bar foo/bar foo\\bar foo:bar foo;bar', 'C++ C# .NET F#', 'x86_64 amd64',
  'ONE PIECE ワンピース 1巻', '鬼滅の刃 23', '進撃の巨人 Attack on Titan', '나 혼자만 레벨업', '원피스 ONE PIECE', 'ｏｎｅ　ｐｉｅｃｅ',
  'ひらがな カタカナ 漢字 ｶﾀｶﾅ', 'ー・ヽヾゝゞ々〆〇', 'ㄱㄴㄷ ㅏㅑ', '한국abc abc한국', '中文English混合123测试',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'abcdefghij abcdefghijk abc ab a', 'superlongwordthatexceedsmaxgram', 'Ü Ö Ä ü ö ä', 'ÀÁÂÃÄÅàáâãäå', 'ČĆŽŠĐ čćžšđ',
  'tab\there\nnew\r\nline', '  leading and trailing  ', '...', '!!!???', '---', '___', "''", '""',
  'lone \ud800 surrogate \udc00 here', '\ud83d', 'á é combining', 'zero​width‌joiner‍test', 'nbsp here', 'soft­hyphen',
  'Vol.1 Vol. 2 T01 #01 Ch.100', '1st 2nd 3rd 4th', '10/20/2020', '1e10 0x1F', 'A1B2C3', '1a2b3c', '٣٤٥ ١٢٣', '१२३', '๑๒๓',
]

const pools = {
  latin: [...range(0x41, 0x5a), ...range(0x61, 0x7a), ...range(0xc0, 0x17f), ...range(0x1e00, 0x1eff)],
  digits: range(0x30, 0x39),
  punct: [...' .,;:!?\'"-_/\\()[]{}@#$%^&*+=<>|~`', '’', '‘', '“', '”', '·', '…', '、', '。', '，', '・', '　', '\t', '\n'],
  cjk: [...range(0x4e00, 0x4e40), ...range(0x6f22, 0x6f40), '𠀋', '𡈽', '𪚲'],
  hira: range(0x3041, 0x3096),
  kata: [...range(0x30a1, 0x30fa), 'ー'],
  halfkata: range(0xff65, 0xff9f),
  full: range(0xff01, 0xff5e),
  hangul: [...range(0xac00, 0xac40), ...range(0x1100, 0x1112), ...range(0x3131, 0x3163)],
  thai: range(0x0e01, 0x0e5b),
  emoji: ['😀', '👍', '🏽', '‍', '❤', '️', '🇫', '🇷', '☕', '⌚', '#', '©', '🧑', '🚀', '⃣'],
  greek: range(0x391, 0x3c9),
  cyr: range(0x410, 0x44f),
}
const poolNames = Object.keys(pools)
const random = []
for (let i = 0; i < 3000; i++) {
  const len = 1 + Math.floor(rnd() * (rnd() < 0.1 ? 300 : 40))
  const mix = [pick(poolNames), pick(poolNames), pick(poolNames), 'punct']
  let s = ''
  for (let j = 0; j < len; j++) s += pick(pools[pick(mix)])
  random.push(s)
}
// balayage de tous les points de code : chaque chaîne contient des morceaux "x<cp>y <cp><cp> 1<cp> <cp>" pour 64 points
const sweep = []
for (let base = 0; base <= 0x10ffff; base += 64) {
  if (base >= 0x30000 && base < 0xe0000) continue
  if (base >= 0xe1000 && base < 0x10fff0) continue
  let s = ''
  for (let cp = base; cp < base + 64 && cp <= 0x10ffff; cp++) {
    const c = String.fromCodePoint(cp)
    s += `a${c}b ${c}${c} 1${c} ${c}　`
  }
  sweep.push(s)
}
writeFileSync('corpus.json', JSON.stringify({ hand, random, sweep }))
console.log(hand.length, random.length, sweep.length)
