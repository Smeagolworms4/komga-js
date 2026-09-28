#!/usr/bin/env bash
# Runs the Kotlin oracle tests of Komga (branch `unit-oracles` of https://github.com/Smeagolworms4/komga)
# and writes their fixtures to test/unit/fixtures/ (read by the TypeScript twins, `npm run test:unit`).
#
# Usage: tools/run-kotlin-oracles.sh [filter...]
#   no filter              all oracle tests (org.gotson.komga.oracle.*)
#   language/LanguageUtils one Kotlin file  -> org.gotson.komga.oracle.language.LanguageUtilsOracleTest
#   domain/model/*         one package      -> org.gotson.komga.oracle.domain.model.*
#   org.gotson...          passed as is to --tests
#
# Environment:
#   KOMGA_ORACLE_DIR  Komga checkout on branch unit-oracles (default: ../komga-oracle next to this repository)
#   JAVA_HOME         JDK 21 (default: ../.oracle-cache/jdk/jdk-21* if present)
#   ORACLE_OUT        output directory (default: test/unit/fixtures)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KOMGA="${KOMGA_ORACLE_DIR:-$ROOT/../komga-oracle}"
KOMGA="$(cd "$KOMGA" && pwd)"
OUT="${ORACLE_OUT:-$ROOT/test/unit/fixtures}"
mkdir -p "$OUT" "$ROOT/build/tmp"
export TMPDIR="$ROOT/build/tmp"
if [ -z "${JAVA_HOME:-}" ]; then
  for j in "$ROOT"/../.oracle-cache/jdk/jdk-21*; do [ -x "$j/bin/java" ] && export JAVA_HOME="$(cd "$j" && pwd)"; done
fi

filters=()
if [ $# -eq 0 ]; then set -- '*'; fi
for f in "$@"; do
  case "$f" in
    org.*) t="$f" ;;
    *)
      t="org.gotson.komga.oracle.${f//\//.}"
      t="${t%.}"
      [[ "$t" == *'*' ]] || t="${t}OracleTest"
      ;;
  esac
  filters+=(--tests "$t")
done

cd "$KOMGA"
start=$(date +%s)
./gradlew :komga:test "${filters[@]}" --rerun \
  -PoracleOut="$OUT" \
  -x runKtlintCheckOverMainSourceSet -x runKtlintCheckOverTestSourceSet \
  -Dorg.gradle.jvmargs="-Xmx2G -Djava.io.tmpdir=$TMPDIR" \
  --console=plain -q
echo "Kotlin oracles written to $OUT in $(($(date +%s) - start)) s"
