import com.fasterxml.jackson.databind.*;
import org.apache.lucene.analysis.*;
import org.apache.lucene.document.*;
import org.apache.lucene.index.*;
import org.apache.lucene.search.*;
import org.apache.lucene.store.*;
import org.apache.lucene.queryparser.classic.*;
import org.gotson.komga.infrastructure.search.*;
import java.util.*;

ObjectMapper om = new ObjectMapper();
JsonNode corpus = om.readTree(new java.io.File("searchcorpus.json"));
Document toDoc(JsonNode d) {
  Document doc = new Document();
  for (JsonNode f : d) {
    String n = f.get(0).asText(), v = f.get(1).asText(), k = f.get(2).asText();
    Field.Store st = (k.equals("T") || k.equals("S")) ? Field.Store.YES : Field.Store.NO;
    if (k.equalsIgnoreCase("t")) doc.add(new TextField(n, v, st)); else doc.add(new StringField(n, v, st));
  }
  return doc;
}
Directory dir = new ByteBuffersDirectory();
IndexWriter w = new IndexWriter(dir, new IndexWriterConfig(new MultiLingualNGramAnalyzer(3, 10, true)));
List<Document> docs = new ArrayList<>();
for (JsonNode d : corpus.get("docs")) docs.add(toDoc(d));
w.addDocuments(docs);
for (JsonNode op : corpus.get("ops")) {
  if (op.get(0).asText().equals("d")) w.deleteDocuments(new Term(op.get(1).asText(), op.get(2).asText()));
  else w.updateDocument(new Term(op.get(1).asText(), op.get(2).asText()), toDoc(op.get(3)));
}
w.forceMerge(1);
w.commit();
SearcherManager sm = new SearcherManager(w, new SearcherFactory());
System.out.println("segments " + sm.acquire().getIndexReader().leaves().size() + " maxDoc " + sm.acquire().getIndexReader().maxDoc() + " numDocs " + sm.acquire().getIndexReader().numDocs());
Analyzer searchAnalyzer = new MultiLingualAnalyzer();
String[][] ents = { {"book","book_id","title","isbn"}, {"series","series_id","title"}, {"collection","collection_id","name"}, {"readlist","readlist_id","name"} };
List<Object> results = new ArrayList<>();
for (JsonNode qn : corpus.get("queries")) {
  String q = qn.asText();
  for (String[] e : ents) {
    Map<String, Object> r = new LinkedHashMap<>();
    r.put("q", q); r.put("entity", e[0]);
    try {
      Query fieldsQuery;
      MultiFieldQueryParser p = new MultiFieldQueryParser(Arrays.copyOfRange(e, 2, e.length), searchAnalyzer);
      p.setDefaultOperator(QueryParser.Operator.AND);
      fieldsQuery = p.parse(q + " *:*");
      Query bq = new BooleanQuery.Builder().add(fieldsQuery, BooleanClause.Occur.MUST).add(new TermQuery(new Term("type", e[0])), BooleanClause.Occur.MUST).build();
      IndexSearcher s = sm.acquire();
      TopDocs td = s.search(bq, 1000);
      List<Object> hits = new ArrayList<>();
      for (ScoreDoc sd : td.scoreDocs) hits.add(List.of(s.storedFields().document(sd.doc).get(e[1]), Float.floatToIntBits(sd.score)));
      r.put("status", "ok"); r.put("hits", hits);
    } catch (ParseException ex) {
      r.put("status", "parse");
    } catch (Exception ex) {
      r.put("status", "error"); r.put("error", ex.getClass().getSimpleName());
    }
    results.add(r);
  }
}
Map<String, Object> out = new LinkedHashMap<>();
out.put("corpus", corpus); out.put("results", results);
om.writeValue(new java.io.File("search-java.json"), out);
System.out.println("done " + results.size());
/exit
