import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.xml.XmlMapper;
import org.apache.commons.validator.routines.ISBNValidator;
import org.gotson.komga.domain.model.*;
import org.gotson.komga.domain.service.BookAnalyzer;
import java.util.*;

var om = new ObjectMapper();

class FakeAnalyzer extends BookAnalyzer {
  static byte[] content = new byte[0];
  static byte[] page = new byte[0];
  FakeAnalyzer() { super(null, null, null, null, null, null, null, 0, null, null, null); }
  @Override public byte[] getFileContent(BookWithMedia b, String f) { return content; }
  @Override public byte[] getPageContent(BookWithMedia b, int p) { return page; }
}
var analyzer = (FakeAnalyzer) sun.reflect.ReflectionFactory.getReflectionFactory().newConstructorForSerialization(FakeAnalyzer.class, Object.class.getDeclaredConstructor()).newInstance();

String exc(Throwable e) { return "EXC:" + e.getClass().getSimpleName(); }

Object dumpBookPatch(BookMetadataPatch p) {
  if (p == null) return null;
  var m = new LinkedHashMap<String,Object>();
  m.put("title", p.getTitle()); m.put("summary", p.getSummary()); m.put("number", p.getNumber());
  m.put("numberSort", p.getNumberSort() == null ? null : p.getNumberSort().toString());
  m.put("releaseDate", p.getReleaseDate() == null ? null : p.getReleaseDate().toString());
  if (p.getAuthors() == null) m.put("authors", null); else { var l = new ArrayList<Object>(); for (var a : p.getAuthors()) l.add(List.of(a.getName(), a.getRole())); m.put("authors", l); }
  m.put("isbn", p.getIsbn());
  if (p.getLinks() == null) m.put("links", null); else { var l = new ArrayList<Object>(); for (var a : p.getLinks()) l.add(List.of(a.getLabel(), a.getUrl().toString())); m.put("links", l); }
  m.put("tags", p.getTags() == null ? null : new ArrayList<Object>(p.getTags()));
  var rl = new ArrayList<Object>(); for (var r : p.getReadLists()) { var e = new ArrayList<Object>(); e.add(r.getName()); e.add(r.getNumber()); rl.add(e); } m.put("readLists", rl);
  return m;
}
Object dumpSeriesPatch(SeriesMetadataPatch p) {
  if (p == null) return null;
  var m = new LinkedHashMap<String,Object>();
  m.put("title", p.getTitle()); m.put("titleSort", p.getTitleSort());
  m.put("status", p.getStatus() == null ? null : p.getStatus().name()); m.put("summary", p.getSummary());
  m.put("readingDirection", p.getReadingDirection() == null ? null : p.getReadingDirection().name());
  m.put("publisher", p.getPublisher()); m.put("ageRating", p.getAgeRating()); m.put("language", p.getLanguage());
  m.put("genres", p.getGenres() == null ? null : new ArrayList<Object>(p.getGenres()));
  m.put("totalBookCount", p.getTotalBookCount());
  m.put("collections", new ArrayList<Object>(p.getCollections()));
  return m;
}
Object dumpFields(Object o) throws Exception {
  if (o == null) return null;
  var m = new LinkedHashMap<String,Object>();
  for (var f : o.getClass().getDeclaredFields()) {
    if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) continue;
    f.setAccessible(true);
    Object v = f.get(o);
    if (v instanceof Enum<?> e) v = e.name();
    else if (v instanceof List<?> l) { var out = new ArrayList<Object>(); for (var x : l) out.add(dumpFields(x)); v = out; }
    m.put(f.getName(), v);
  }
  return m;
}
import org.gotson.komga.infrastructure.metadata.mylar.*;
import com.fasterxml.jackson.databind.*;
var mapper = org.springframework.http.converter.json.Jackson2ObjectMapperBuilder.json().featuresToEnable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES, MapperFeature.ACCEPT_CASE_INSENSITIVE_PROPERTIES, MapperFeature.ACCEPT_CASE_INSENSITIVE_VALUES).build();
List<String> cases = om.readValue(new java.io.File("mylar-cases.json"), new com.fasterxml.jackson.core.type.TypeReference<List<String>>(){});
var provider = new MylarSeriesProvider(mapper);
var dir = java.nio.file.Files.createTempDirectory("mylar");
var series = org.gotson.komga.domain.model.UtilsKt.makeSeries("series", "", dir.toUri().toURL());
var res = new ArrayList<Object>();
for (String c : cases) {
  var m = new LinkedHashMap<String,Object>();
  try { var s = mapper.readValue(c, org.gotson.komga.infrastructure.metadata.mylar.dto.Series.class); m.put("dto", s == null ? null : s.toString()); } catch (Exception e) { m.put("dto", exc(e)); }
  java.nio.file.Files.writeString(dir.resolve("series.json"), c);
  try { m.put("patch", dumpSeriesPatch(provider.getSeriesMetadata(series))); } catch (Exception e) { m.put("patch", exc(e)); }
  res.add(m);
}
om.writerWithDefaultPrettyPrinter().writeValue(new java.io.File("mylar-oracle.json"), res);
/exit
