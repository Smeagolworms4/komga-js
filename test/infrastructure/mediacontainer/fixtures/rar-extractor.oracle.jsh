// Oracle de DivinaExtractorOracle.test.ts (RarExtractor) : getEntries(path, false) puis getEntryStream pour chaque entrée
// (longueur et CRC32 des octets, ou exception), sur les archives de fixtures/rar.
// Usage : tools/jshell-komga.sh test/infrastructure/mediacontainer/fixtures/rar-extractor.oracle.jsh > test/infrastructure/mediacontainer/fixtures/rar.java.jsonl
import java.nio.file.*;
import java.util.*;
import java.util.zip.CRC32;
import com.fasterxml.jackson.databind.ObjectMapper;
var om = new ObjectMapper();
var ex = new org.gotson.komga.infrastructure.mediacontainer.divina.RarExtractor(new org.gotson.komga.infrastructure.mediacontainer.ContentDetector(new org.apache.tika.config.TikaConfig()), new org.gotson.komga.infrastructure.image.ImageAnalyzer());
var dir = Path.of("test/infrastructure/mediacontainer/fixtures/rar");
var files = new ArrayList<Path>();
try (var s = Files.list(dir)) { s.forEach(files::add); }
files.sort(Comparator.comparing(p -> p.getFileName().toString()));
for (var p : files) {
  var res = new LinkedHashMap<String, Object>();
  res.put("file", p.getFileName().toString());
  try {
    var entries = new ArrayList<Object>();
    for (var e : ex.getEntries(p, false)) {
      var m = new LinkedHashMap<String, Object>();
      m.put("name", e.getName());
      m.put("mediaType", e.getMediaType());
      m.put("fileSize", e.getFileSize());
      m.put("comment", e.getComment());
      try {
        byte[] b = ex.getEntryStream(p, e.getName());
        var crc = new CRC32();
        crc.update(b);
        m.put("len", b.length);
        m.put("crc", crc.getValue());
      } catch (Throwable t) {
        m.put("streamErr", t.getClass().getSimpleName() + ": " + t.getMessage());
      }
      entries.add(m);
    }
    res.put("entries", entries);
  } catch (Throwable t) {
    if (t instanceof org.gotson.komga.domain.model.MediaUnsupportedException mu) res.put("unsupported", mu.getCode());
    else res.put("error", t.getClass().getSimpleName());
  }
  System.out.println(om.writeValueAsString(res));
}
/exit
