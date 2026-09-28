import com.fasterxml.jackson.databind.*;
import org.apache.lucene.analysis.*;
import org.apache.lucene.analysis.tokenattributes.*;
import org.gotson.komga.infrastructure.search.*;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.*;

ObjectMapper om = new ObjectMapper();
JsonNode corpus = om.readTree(new java.io.File("corpus.json"));
Analyzer a1 = new MultiLingualAnalyzer();
Analyzer a2 = new MultiLingualNGramAnalyzer(3, 10, true);

List<List<Object>> tokens(Analyzer a, String text) throws Exception {
  List<List<Object>> out = new ArrayList<>();
  try (TokenStream ts = a.tokenStream("text", text)) {
    CharTermAttribute t = ts.addAttribute(CharTermAttribute.class);
    PositionIncrementAttribute p = ts.addAttribute(PositionIncrementAttribute.class);
    OffsetAttribute o = ts.addAttribute(OffsetAttribute.class);
    TypeAttribute ty = ts.addAttribute(TypeAttribute.class);
    ts.reset();
    while (ts.incrementToken()) out.add(List.of(t.toString(), p.getPositionIncrement(), o.startOffset(), o.endOffset(), ty.type()));
    ts.end();
    out.add(List.of("<END>", p.getPositionIncrement(), o.startOffset(), o.endOffset(), ""));
  }
  return out;
}

String digest(List<List<Object>> toks) throws Exception {
  StringBuilder sb = new StringBuilder();
  for (List<Object> t : toks) { for (Object x : t) sb.append(x).append('\u0001'); sb.append('\u0002'); }
  MessageDigest md = MessageDigest.getInstance("SHA-1");
  byte[] h = md.digest(sb.toString().getBytes(StandardCharsets.UTF_8));
  return HexFormat.of().formatHex(h);
}

Map<String, Object> res = new LinkedHashMap<>();
List<Object> full = new ArrayList<>();
for (String k : List.of("hand", "random")) for (JsonNode n : corpus.get(k)) {
  String s = n.asText();
  Map<String, Object> e = new LinkedHashMap<>();
  e.put("text", s); e.put("std", tokens(a1, s)); e.put("ngram", tokens(a2, s));
  e.put("normalize", a1.normalize("f", s).utf8ToString());
  full.add(e);
}
res.put("full", full);
List<Object> sw = new ArrayList<>();
for (JsonNode n : corpus.get("sweep")) { String s = n.asText(); sw.add(List.of(digest(tokens(a1, s)), digest(tokens(a2, s)), digest(List.of(List.of(a1.normalize("f", s).utf8ToString()))))); }
res.put("sweep", sw);
res.put("random", corpus.get("random")); om.writeValue(new java.io.File("tokens-java.json"), res);
System.out.println("done " + full.size() + " " + sw.size());
/exit
