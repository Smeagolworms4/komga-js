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
import org.gotson.komga.infrastructure.metadata.comicrack.*;
import org.gotson.komga.infrastructure.metadata.comicrack.dto.*;
List<Map<String,Object>> cases = om.readValue(new java.io.File("xml-cases.json"), new com.fasterxml.jackson.core.type.TypeReference<List<Map<String,Object>>>(){});
var res = new ArrayList<Object>();
var book = org.gotson.komga.domain.model.UtilsKt.makeBook("book", java.time.LocalDateTime.now(), "", "", null, "id");
var media = new Media(Media.Status.READY, "application/zip", List.of(), 0, List.of(new MediaFile("ComicInfo.xml", null, null, null)), null, null, "", false, false, java.time.LocalDateTime.now(), java.time.LocalDateTime.now());
var bwm = new BookWithMedia(book, media);
var ci = new ComicInfoProvider(new XmlMapper(), analyzer, new ISBNValidator(true));
var rl = new ReadListProvider(new XmlMapper());
for (var c : cases) {
  byte[] bytes = Base64.getDecoder().decode((String) c.get("b64"));
  var m = new LinkedHashMap<String,Object>();
  m.put("id", c.get("id"));
  if (c.get("cls").equals("ComicInfo")) {
    try { m.put("dto", dumpFields(new XmlMapper().readValue(bytes, ComicInfo.class))); } catch (Exception e) { m.put("dto", exc(e)); }
    FakeAnalyzer.content = bytes;
    try { m.put("book", dumpBookPatch(ci.getBookMetadataFromBook(bwm))); } catch (Exception e) { m.put("book", exc(e)); }
    try { m.put("series", dumpSeriesPatch(ci.getSeriesMetadataFromBook(bwm, true))); } catch (Exception e) { m.put("series", exc(e)); }
    try { m.put("seriesNoAppend", dumpSeriesPatch(ci.getSeriesMetadataFromBook(bwm, false))); } catch (Exception e) { m.put("seriesNoAppend", exc(e)); }
  } else {
    try { m.put("dto", dumpFields(new XmlMapper().readValue(bytes, ReadingList.class))); } catch (Exception e) { m.put("dto", exc(e)); }
    try {
      var r = rl.importFromCbl(bytes);
      var rm = new LinkedHashMap<String,Object>(); rm.put("name", r.getName());
      var bl = new ArrayList<Object>(); for (var b : r.getBooks()) bl.add(List.of(new ArrayList<Object>(b.getSeries()), b.getNumber())); rm.put("books", bl);
      m.put("request", rm);
    } catch (ComicRackListException e) { m.put("request", "ERR:" + e.getCode()); } catch (Exception e) { m.put("request", exc(e)); }
  }
  res.add(m);
}
om.writerWithDefaultPrettyPrinter().writeValue(new java.io.File("xml-oracle.json"), res);
/exit
