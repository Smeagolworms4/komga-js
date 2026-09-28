const cases = new Set([
  'plain', '  lead and trail  ', 'a  b\n\nc\td', '<p>a</p><p>b</p>', '<div>\n  <p>Para 1</p>\n  <p>Para 2</p></div>', '<p>a<br>b</p>', 'a<br/>b', 'x <b>bold</b> y', '<b>a</b><i>b</i>',
  '<script>alert(1)</script>visible', '<style>p{}</style>x', '<noscript>ns <b>text</b></noscript>', '<template><p>tpl</p></template>after', '<iframe>if</iframe>x', '<xmp><b>xmp</b></xmp>', '<noembed>ne</noembed>', '<noframes>nf</noframes>',
  '<textarea>&lt;x&gt; y</textarea>', '<title>T &amp; t</title>body', '<table><tr><td>cell</td></tr></table>after', '<table>foster<tr><td>c</td></tr></table>', '<table><b>b</b><td>x</td></table>', '<ul><li>one</li><li>two</li></ul>', '<ol><li>1<li>2</ol>',
  '<svg><script>svgscript</script><text>svgtext</text></svg>', '<svg><![CDATA[cdata in svg]]></svg>', '<math><mi>x</mi><![CDATA[m]]></math>', '<!-- comment -->text', 'text<!-- c', '<![CDATA[cdata in html]]>',
  '&amp; &lt; &gt; &quot; &apos; &nbsp; &copy &copy; &notit; &not; &NotEqualTilde; &acE; &fjlig; &unknown; & alone', '&#0; &#1; &#128; &#150; &#xD800; &#x10FFFF; &#x110000; &#99999999999; &#; &#x; &#65', '\u0000null', 'nb sp', 'zw​sp', 'soft­hy', 'ctrl\u0001\u0008\u000b\u000e\u001f\u007f\u0085', 'emoji 😀 𝟏',
  '<p>a </p><p> b</p>', '<p>a</p> <p>b</p>', '<span>a</span> <span>b</span>', 'a<span> </span>b', 'a <span></span> b', '<p> </p>text', 'text<p> </p>', '<p> </p>x', '   ', '\n', '', '<br>', '<p></p>',
  '<html><head><title>h</title></head><body>b</body></html>', '<body>body tag</body>', '<head>in head</head>x', '<frameset><frame></frameset>', '<pre>\n  pre  text\n</pre>', '<pre>a\n\nb</pre>', '<plaintext><b>pt</b>',
  '<a href="x">link</a>', '<img alt="alt">text', '<input value="v">', '<select><option>o1</option><option>o2</option></select>', '<button>btn</button>', '<p>unclosed', '<div><p>nested<div>block</div></p></div>', '<b><p>mis</b>nested</p>',
  '<h1>Title</h1><p>Body &amp; soul</p>', 'Tom &amp; Jerry', 'a &lt; b', '&amp;nbsp;', '1 < 2 > 0', '<3', '< p>not tag', '</p>stray end', '<p/>self closed', '<!doctype html>doc', '<?php echo 1 ?>pi', '<a<b>weird',
  "<p>quote \" and ' apostrophe</p>", '<p>tab\there</p>', 'line1\r\nline2\rline3', '<p>\n\n  multi\n\n  lines  \n</p>', '<blockquote>q</blockquote>after', '<dl><dt>t</dt><dd>d</dd></dl>',
  '<table><caption>cap</caption><tr><th>h</th></tr></table>', '<object><param>p</param>obj</object>', '<ruby>r<rt>t</rt></ruby>', '<isindex>', '<image>', '<keygen>', '<marquee>m</marquee>', '<listing>l</listing>',
  '<p>Bereits im ersten Band "Panik im Paradies" machen die drei berühmten Detektive ihrem Namen alle Ehre.</p>',
])
let seed = 12345
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
const tokens = ['<p>', '</p>', '<div>', '</div>', '<b>', '</b>', '<i>', '</i>', '<br>', '<br/>', '<span>', '</span>', '<table>', '<tr>', '<td>', '</td>', '</table>', '<ul>', '<li>', '</ul>', '<script>', '</script>', '<style>', '</style>', '<textarea>', '</textarea>', '<!--', '-->', ' ', '  ', '\n', '\t', ' ', 'a', 'bc', 'Déf', '&amp;', '&nbsp;', '&lt;', '&copy', '&', '<', '>', '"', "'", '<a href=x>', '</a>', '<svg>', '</svg>', '<pre>', '</pre>', '<h2>', '</h2>', '<select>', '<option>', '<title>', '</title>', '<noscript>', '</noscript>', '<template>', '</template>', '<xmp>', '</xmp>', '&#233;', '&#x1F600;', '​', '­', '<![CDATA[', ']]>', '<math>', '</math>', '<frameset>', '<body>', '<html>', '<head>', '<caption>', '<colgroup>', '<col>', '<hr>', '<button>', '</button>', '<form>', '</form>', '<input>', '<img>']
for (let i = 0; i < 700; i++) {
  const n = 1 + rnd(25)
  let s = ''
  for (let j = 0; j < n; j++) s += tokens[rnd(tokens.length)]
  cases.add(s)
}
process.stdout.write(JSON.stringify([...cases]))
