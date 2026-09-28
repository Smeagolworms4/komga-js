#!/usr/bin/env bash
# Oracle : exécute un script jshell avec le classpath complet de Komga (ses classes + toutes ses dépendances).
# Usage : tools/jshell-komga.sh script.jsh
# Le classpath est calculé une fois par Gradle dans build/komga-classpath.txt.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CP="$ROOT/build/komga-classpath.txt"
if [ ! -s "$CP" ]; then
  mkdir -p "$ROOT/build"
  INIT="$(mktemp --suffix=.gradle)"
  cat > "$INIT" <<'G'
allprojects {
  tasks.register("printTestClasspath") {
    doLast {
      def ss = project.extensions.findByName("sourceSets")
      if (ss != null && ss.findByName("test") != null) new File(System.getProperty("cpOut")).text = ss.test.runtimeClasspath.asPath
    }
  }
}
G
  (cd "$ROOT/upstream" && ./gradlew :komga:classes :komga:printTestClasspath -I "$INIT" -DcpOut="$CP" --no-daemon -q)
  rm -f "$INIT"
fi
# ne garder que les entrées existantes (jshell refuse les chemins absents)
EXISTING="$(tr ':' '\n' < "$CP" | while read -r e; do [ -e "$e" ] && printf '%s:' "$e"; done)"
exec jshell --class-path "${EXISTING%:}" "$@"
