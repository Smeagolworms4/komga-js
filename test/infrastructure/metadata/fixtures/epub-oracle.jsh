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
import org.gotson.komga.infrastructure.metadata.epub.*;
List<String> cases = om.readValue(new java.io.File("epub-cases.json"), new com.fasterxml.jackson.core.type.TypeReference<List<String>>(){});
var provider = new EpubMetadataProvider(new ISBNValidator(true));
var dir = java.nio.file.Files.createTempDirectory("epubs");
var media = new Media(Media.Status.READY, "application/epub+zip", List.of(), 0, List.of(), null, null, "", false, false, java.time.LocalDateTime.now(), java.time.LocalDateTime.now());
var res = new ArrayList<Object>();
int n = 0;
for (String c : cases) {
  var f = dir.resolve("b" + (n++) + ".epub");
  try (var zos = new java.util.zip.ZipOutputStream(java.nio.file.Files.newOutputStream(f))) {
    zos.putNextEntry(new java.util.zip.ZipEntry("mimetype")); zos.write("application/epub+zip".getBytes()); zos.closeEntry();
    zos.putNextEntry(new java.util.zip.ZipEntry("META-INF/container.xml")); zos.write("<?xml version=\"1.0\"?><container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\"><rootfiles><rootfile full-path=\"content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles></container>".getBytes()); zos.closeEntry();
    zos.putNextEntry(new java.util.zip.ZipEntry("content.opf")); zos.write(c.getBytes(java.nio.charset.StandardCharsets.UTF_8)); zos.closeEntry();
  }
  var book = org.gotson.komga.domain.model.UtilsKt.makeBook("book", java.time.LocalDateTime.now(), "", "", f.toUri().toURL(), "id");
  var bwm = new BookWithMedia(book, media);
  var m = new LinkedHashMap<String,Object>();
  try { m.put("book", dumpBookPatch(provider.getBookMetadataFromBook(bwm))); } catch (Exception e) { m.put("book", exc(e)); }
  try { m.put("series", dumpSeriesPatch(provider.getSeriesMetadataFromBook(bwm, true))); } catch (Exception e) { m.put("series", exc(e)); }
  res.add(m);
}
om.writerWithDefaultPrettyPrinter().writeValue(new java.io.File("epub-oracle.json"), res);
/exit
