#!/bin/sh
# Suite de tests dans le système de l'image amd64 / arm64 : Alpine (musl) et le Node à compression de pointeurs.
# Usage : docker run --rm -v "$PWD:/src:ro" smeagolworms4/node-pointer-compression:24-alpine sh /src/tools/alpine-tests.sh
# Copie les sources (montées en lecture seule) dans /work, puis lance les tests sous l'utilisateur node : en root,
# un dossier en lecture seule reste inscriptible et le cas « not writable » de TempDirectoryChecker échoue.
set -eu
# coreutils : `touch -d @<secondes>` des tests (celui de BusyBox ne le lit pas) ; zip : archives de test
apk add --no-cache build-base python3 icu-dev icu-data-full coreutils zip tzdata rsync > /dev/null
mkdir /work
rsync -a --exclude node_modules --exclude build --exclude dist --exclude coverage --exclude upstream \
  --exclude resources/public --exclude resources/git.properties /src/ /work/
chown -R node:node /work
su node -c '
  set -eu
  cd /work
  export npm_config_nodedir=/usr/local
  node -p "\"Node \" + process.version + \" on Alpine \" + require(\"fs\").readFileSync(\"/etc/alpine-release\", \"utf8\").trim() + \", pointer compression \" + process.config.variables.v8_enable_pointer_compression"
  npm ci --no-audit --no-fund
  npm run build:native
  npm run test:unit
  TZ=Europe/Paris LANG=fr_FR.UTF-8 npx vitest run
'
