import { writeFileSync } from 'node:fs'
let seed = 7
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000)
const pick = (a) => a[Math.floor(rnd() * a.length)]
const words = ['batman', 'Batman', 'robin', 'joker', 'gotham', 'dark', 'knight', 'returns', 'the', 'of', 'and', 'Éric', 'èl', 'rojo', 'café', 'naïve', 'Straße', 'Łódź',
  'one', 'piece', 'ワンピース', 'ワンパンマン', '進撃の巨人', '鬼滅の刃', '不道德公會', '河添太一', '東立', '探偵はもう、死んでいる', '나', '혼자만', '레벨업', '고교생을', 'สวัสดี',
  'vol', 'Vol.1', '01', '02', '10', '2021', '1999', 'x-men', "L'Arabe", 'futur', 'spider-man', 'superman', 'wonder', 'woman', 'saga', 'tome', 'chapitre', 'ＡＢＣ', 'ﾜﾝﾊﾟﾝﾏﾝ',
  'dragon', 'ball', 'dragonball', 'z', 'super', 'naruto', 'shippuden', 'bleach', 'hunter', 'hunterxhunter', 'death', 'note', 'deathnote', 'akira', 'ghost', 'shell', 'the', 'a', 'an', '😀', 'batmobile', 'bat']
const roles = ['writer', 'penciller', 'inker', 'colorist', 'letterer', 'cover', 'editor', 'translator']
const people = ['Frank Miller', 'Alan Moore', 'Eiichiro Oda', 'Akira Toriyama', '尾田栄一郎', 'Hajime Isayama', 'Neil Gaiman', 'Jean Van Hamme', 'Hergé', 'René Goscinny', 'Riad Sattouf']
const tagsV = ['action', 'comedy', 'drama', 'shonen', 'seinen', 'sci-fi', 'fantasy', 'horror', 'romance', 'ドラマ', 'école', 'super hero', 'dark']
const title = () => { const n = 1 + Math.floor(rnd() * 5); const t = []; for (let i = 0; i < n; i++) t.push(pick(words)); return t.join(pick([' ', ' ', ' ', ': ', ' - ', ', '])) }
const isbn = () => rnd() < 0.5 ? '' : '978' + String(Math.floor(rnd() * 1e10)).padStart(10, '0')
const docs = []
let id = 0
const T = (n, v, stored = false) => [n, v, stored ? 'T' : 't']
const S = (n, v, stored = false) => [n, v, stored ? 'S' : 's']
const titles = Array.from({ length: 60 }, title)
for (let i = 0; i < 300; i++) {
  const d = []
  d.push(T('title', rnd() < 0.3 ? pick(titles) : title()))
  d.push(T('isbn', isbn()))
  for (let k = 0; k < Math.floor(rnd() * 3); k++) d.push(T('tag', pick(tagsV)))
  for (let k = 0; k < Math.floor(rnd() * 3); k++) { const p = pick(people); d.push(T('author', p)); d.push(T(pick(roles), p)) }
  if (rnd() < 0.7) d.push(T('release_date', String(1950 + Math.floor(rnd() * 75))))
  d.push(T('status', pick(['READY', 'READY', 'ERROR', 'UNKNOWN'])))
  d.push(T('deleted', rnd() < 0.1 ? 'true' : 'false'))
  d.push(T('oneshot', rnd() < 0.1 ? 'true' : 'false'))
  d.push(S('type', 'book'))
  d.push(S('book_id', 'B' + String(id++).padStart(4, '0'), true))
  docs.push(d)
}
for (let i = 0; i < 150; i++) {
  const d = []
  const t = rnd() < 0.3 ? pick(titles) : title()
  d.push(T('title', t))
  if (rnd() < 0.3) d.push(T('title', 'The ' + t))
  for (let k = 0; k < Math.floor(rnd() * 3); k++) d.push(T('title', title()))
  d.push(T('publisher', pick(['DC Comics', 'Marvel', 'Shueisha', 'Kōdansha', 'Glénat', 'Dargaud', ''])))
  d.push(T('status', pick(['ONGOING', 'ENDED', 'HIATUS', 'ABANDONED'])))
  d.push(T('reading_direction', pick(['LEFT_TO_RIGHT', 'RIGHT_TO_LEFT', 'VERTICAL', 'WEBTOON'])))
  if (rnd() < 0.5) d.push(T('age_rating', String(pick([0, 12, 16, 18]))))
  if (rnd() < 0.6) d.push(T('language', pick(['en', 'fr', 'ja', 'zh-Hant', 'ko'])))
  for (let k = 0; k < Math.floor(rnd() * 3); k++) { const tg = pick(tagsV); d.push(T('series_tag', tg)); d.push(T('tag', tg)) }
  for (let k = 0; k < Math.floor(rnd() * 2); k++) d.push(T('genre', pick(tagsV)))
  const tbc = rnd() < 0.5 ? Math.floor(rnd() * 20) : null
  if (tbc !== null) d.push(T('total_book_count', String(tbc)))
  const bc = Math.floor(rnd() * 20)
  d.push(T('book_count', String(bc)))
  for (let k = 0; k < Math.floor(rnd() * 3); k++) { const p = pick(people); d.push(T('author', p)); d.push(T(pick(roles), p)) }
  d.push(T('deleted', 'false'))
  d.push(T('oneshot', rnd() < 0.1 ? 'true' : 'false'))
  if (tbc !== null) d.push(T('complete', String(tbc === bc)))
  d.push(S('type', 'series'))
  d.push(S('series_id', 'S' + String(id++).padStart(4, '0'), true))
  docs.push(d)
}
for (let i = 0; i < 60; i++) {
  const c = rnd() < 0.5
  docs.push([T('name', rnd() < 0.3 ? pick(titles) : title()), S('type', c ? 'collection' : 'readlist'), S(c ? 'collection_id' : 'readlist_id', (c ? 'C' : 'R') + String(id++).padStart(4, '0'), true)])
}
docs.push([S('index_version', '8', true), S('type', 'index_version')])
// shuffle order a bit (interleave types)
for (let i = docs.length - 2; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [docs[i], docs[j]] = [docs[j], docs[i]] }
// updates / deletes applied after initial add
const ops = []
for (let k = 0; k < 20; k++) { const d = pick(docs); const idf = d[d.length - 1]; if (d[d.length - 1][2] !== 'S') continue; ops.push(['d', idf[0], idf[1]]) }
for (let k = 0; k < 20; k++) { const d = pick(docs.filter((x) => x[x.length - 1][0] === 'book_id')); const idf = d[d.length - 1]; const nd = d.map((f) => (f[0] === 'title' ? T('title', title()) : f)); ops.push(['u', idf[0], idf[1], nd]) }

const hand = ['batman', 'Batman', 'BATMAN', 'bat', 'batm', 'atma', 'batman returns', '"batman returns"', '"dark knight"~2', '"knight dark"~2', '"knight dark"~1', '"the batman"', 'batman AND robin', 'batman OR robin', 'batman && robin', 'batman || robin', 'batman NOT robin', 'batman !robin', 'batman -robin', '+batman +robin', '+batman -robin', '(batman OR robin) AND joker', 'batman^2 robin', 'batman^0.5 OR robin', '(batman robin)^3', 'bat*', 'b*', 'ba?man', 'b?t*', 'dark*', 'drag*ball', 'batman~', 'batmn~', 'batmn~1', 'btman~2', 'bat~0', 'batman~0.8', 'batman~1.5', 'robni~', 'gotham~', 'tag:action', 'tag:dark', 'tag:"super hero"', 'author:miller', 'author:"frank miller"', 'writer:moore', 'penciller:oda', 'release_date:1999', 'release_date:[1990 TO 2000]', 'release_date:{1990 TO 2000}', 'release_date:[2000 TO *]', 'release_date:[* TO 1960]', 'release_date:[* TO *]', 'status:ready', 'status:error', 'deleted:true', 'oneshot:true', 'language:fr', 'age_rating:18', 'complete:true', 'book_count:[1 TO 5]', 'publisher:marvel', 'reading_direction:webtoon', 'genre:horror', 'series_tag:comedy', 'book_tag:comedy', 'title:batman', 'isbn:978*', 'isbn:9780*', '978', 'name:batman', 'Éric', 'eric', 'ERIC', 'cafe', 'café', 'strasse', 'straße', 'lodz', 'Łódź', 'naive', 'ワンピース', 'ワンピ', 'ピース', 'ワンパンマン', 'ﾜﾝﾊﾟﾝﾏﾝ', '進撃', '進撃の巨人', '巨人', '鬼滅', '不道德', '道德公會', '河添', '東立', '探偵', 'もう', '나 혼자만', '레벨업', '혼자', 'สวัสดี', 'vol', 'vol.1', 'vol 1', '01', '1', '10', '2021', "l'arabe", 'arabe', 'x-men', 'x men', 'spider-man', '"spider man"', 'abc', 'ＡＢＣ', '😀', 'the', 'the of', 'a', 'one piece', '"one piece"', 'one AND piece', 'one OR piece', 'hunterxhunter', 'hunter', 'deathnote', 'death note', 'dragonball', 'dragon ball', '"dragon ball z"', 'dragon ball z', '/bat.*/', '/b[a-z]+n/', '/.*man/', '/ba(t|d)man/', '/[0-9]{4}/', 'release_date:/19[5-9][0-9]/', '/<1990-2000>/', '/~(batman)/', '/bat&.*man/', '/@/', '/#/', 'title:/ro.*/', '*:*', 'title:*', 'title:bat*', 'title:"dark knight"', 'title:(batman robin)', 'title:(batman OR robin)', 'title:batman robin', '+title:batman', '-title:batman', 'NOT batman', '-batman', '!batman', 'foo', 'zzzzz', 'batman AND zzzzz', 'batman OR zzzzz', 'batman zzzzz', '"batman zzzzz"', 'a*', '*', '?', '*bat', '?at', 'bat\\*', 'bat\\?', 'x\\-men', 'spider\\-man', '\\"batman\\"', 'b\\u0061tman', '\\u0062atman', 'batman\\', '\\u12', '\\uzzzz', '(', ')', '(batman', 'batman)', '((batman))', '"unterminated', 'batman^', 'batman^a', '^2', 'batman^2.5', 'batman^-1', '[a TO', '[a TO b', '{a TO b]', '[a b]', '[ TO b]', 'title:[a TO c]', 'title:{a TO c}', 'title:["a" TO "c"]', 'title:[bat TO bat]', 'title:', ':batman', 'batman:', 'AND', 'OR', 'NOT', 'batman AND', 'batman OR', 'AND batman', 'OR batman', 'batman AND NOT robin', 'batman OR NOT robin', '&&', '||', '!', '+', '-', '+ batman', '- batman', '! batman', 'batman +', 'batman -', '~', 'batman ~', '~2', '"batman"~', '"batman robin"~a', '"batman robin"~-1', '"batman robin"~1.7', 'batman~2^3', 'batman^3~2', '"batman robin"^2~3', '"batman robin"~3^2', '/unterminated', '/[z-a]/', '/a{3,2}/', '/<foo>/', '/\\q/', 'title:/[/', '*:batman', 'batman:*', '*:bat*', 'type:book', 'book_id:B0001', 'book_id:b0001', 'index_version:8', 'tag:action AND status:ready', 'tag:action OR tag:comedy', '(tag:action OR tag:comedy) -status:error', 'author:(miller OR moore)', 'writer:"alan moore"~1', '尾田', '尾田栄一郎', 'toriyama akira', 'hergé', 'herge', 'goscinny', '"frank miller"', '\t batman \n', '   ', 'batman\trobin', 'batman　robin', 'batman  robin', 'Vol.1', 'vol.1 batman', 'batman: returns', 'batman - returns', 'batman, robin', 'bat man', '"bat man"', 'batmanrobin', 'robin batman joker gotham', 'robin batman joker gotham dark knight returns', 'the the the', 'batman batman', 'batman^2 batman', 'title:batman title:batman', 'saga~1', 'tome~', 'chapitre~2', 'z', 'z~', 'x~1', 'an', 'shell~', 'ghost shell', '"ghost shell"~5', '"shell ghost"~5', '"the the"~3', '"batman batman"~2', '"dark dark knight"~4']
const vocab = [...words.map((w) => w.toLowerCase()), 'bat*', 'rob?n', 'dark~', '"dark knight"', 'tag:action', 'author:moore', 'release_date:[1980 TO 2000]', '"batman robin"~2', '"dark knight returns"~3', 'robn~', 'jokr~1', '/ba.*/', 'tag:dark*', 'release_date:{1970 TO 1990]', 'title:gotham', 'status:ready', 'ワンピ', '進撃の', '"one piece"', 'isbn:978*', 'the~', 'nar?to']
const ops2 = ['', '', '', 'AND ', 'OR ', 'NOT ', '+', '-', '!']
const random = []
for (let i = 0; i < 1500; i++) {
  const n = 1 + Math.floor(rnd() * 4)
  let q = ''
  for (let k = 0; k < n; k++) {
    let t = pick(vocab)
    if (rnd() < 0.1) t = `(${t} ${pick(vocab)})`
    if (rnd() < 0.08) t += '^' + pick(['2', '0.5', '3'])
    q += (k > 0 ? ' ' + pick(ops2) : rnd() < 0.2 ? pick(['+', '-']) : '') + t
  }
  random.push(q)
}
writeFileSync('searchcorpus.json', JSON.stringify({ docs, ops, queries: [...hand, ...random] }))
console.log(docs.length, ops.length, hand.length + random.length)
