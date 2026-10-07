# KomgaJS : le backend porté de Komga, avec les interfaces web de Komga (komga-webui et next-ui)
# construites depuis le même commit que celui porté (UPSTREAM_REF).
# Même usage que l'image de Komga : volume /config, port 25600, bibliothèques montées où l'on veut.
#
# Plateformes :
#  - linux/amd64 et linux/arm64 : Alpine, sur un Node 24 compilé avec la compression de pointeurs de V8
#    (https://github.com/Smeagolworms4/node-pointer-compression) : tas JavaScript plus petit, sans perte de vitesse
#    mesurée ; la suite de tests y passe en entier (build.yml, job « Alpine »). L'image finale part de la variante
#    « slim » (le binaire node seul) et ne fait que copier des fichiers.
#  - linux/arm/v7 : Debian, sur le Node 22 LTS officiel. La compression de pointeurs n'existe qu'en 64 bits, Node 24
#    n'a plus de binaire armv7 (ni officiel, ni non officiel, pas d'image node:24 arm/v7), et sharp n'a pas de binaire
#    musl pour armv7. Node 22 est testé en CI (build.yml, job « Node 22 ») ; fin de support de Node 22 : avril 2027.
ARG TARGETARCH

# --- Sources de Komga, au commit porté -------------------------------------------------------
FROM --platform=$BUILDPLATFORM alpine/git:v2.52.0 AS komga-src
ARG KOMGA_REF
RUN test -n "$KOMGA_REF" && \
    git clone --filter=blob:none --no-checkout https://github.com/gotson/komga.git /komga && \
    git -C /komga checkout "$KOMGA_REF"

# --- Interfaces web (versions de Node de leurs .nvmrc) ---------------------------------------
# Fichiers statiques, identiques pour toutes les architectures : construits sur la plateforme de build.
FROM --platform=$BUILDPLATFORM node:22-bookworm AS webui
COPY --from=komga-src /komga/komga-webui /webui
WORKDIR /webui
RUN npm ci --no-audit --no-fund && npm run build

FROM --platform=$BUILDPLATFORM node:24-bookworm AS nextui
COPY --from=komga-src /komga/next-ui /nextui
WORKDIR /nextui
RUN npm ci --no-audit --no-fund && npm run build

# --- Outils de compilation, par architecture (voir en tête) ------------------------------------
FROM smeagolworms4/node-pointer-compression:24-alpine AS build-base-alpine
# icu-data-full : données ICU complètes, comme sous Debian (le paquet de base d'Alpine ne contient que l'anglais)
RUN apk add --no-cache build-base python3 icu-dev icu-data-full
# Modules natifs compilés à l'installation (xxhash-addon n'a pas de binaire musl) : avec les en-têtes de l'image,
# ceux du Node à compression de pointeurs, et non ceux de nodejs.org.
ENV npm_config_nodedir=/usr/local

FROM node:22-bookworm AS build-base-debian
RUN apt-get update && apt-get install -y --no-install-recommends libicu-dev && rm -rf /var/lib/apt/lists/*

FROM build-base-alpine AS build-base-amd64
FROM build-base-alpine AS build-base-arm64
FROM build-base-debian AS build-base-arm

# --- KomgaJS : modules natifs (ICU, libjpeg 6b + LittleCMS, bcrypt, ZXing) et compilation TypeScript
FROM build-base-${TARGETARCH} AS build
ARG TARGETARCH
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 n'a de binaire précompilé que pour x64 et arm64 : ailleurs (armv7), compilé depuis ses sources
# (SQLite inclus dans le paquet) avec le node-gyp de npm et les en-têtes de l'image.
RUN npm ci --no-audit --no-fund && \
    if ! node -e "require('better-sqlite3')(':memory:').close()" 2>/dev/null; then \
      cd node_modules/better-sqlite3 && \
      node "$(npm root -g)/npm/node_modules/node-gyp/bin/node-gyp.js" rebuild --release --nodedir=/usr/local --jobs=max && \
      rm -rf build/Release/obj.target build/Release/.deps && \
      node -e "require('better-sqlite3')(':memory:').close()"; \
    fi && \
    node -e "require('xxhash-addon'); require('sharp')"
COPY . .
COPY --from=webui /webui/dist /tmp/webui
COPY --from=nextui /nextui/dist /tmp/nextui
# Branche et commit de KomgaJS pour /actuator/info (le .git n'est pas copié dans le contexte de build)
ARG GIT_BRANCH
ARG GIT_COMMIT
ARG GIT_COMMIT_TIME
RUN npm run build:native && \
    GIT_BRANCH="$GIT_BRANCH" GIT_COMMIT="$GIT_COMMIT" GIT_COMMIT_TIME="$GIT_COMMIT_TIME" npm run build && \
    node tools/install-webui.mjs /tmp/webui /tmp/nextui && \
    npm prune --omit=dev
# Ce que l'image finale doit trouver hors de /app, rassemblé sous /runtime pour n'avoir qu'à le copier : kepubify,
# et sous Alpine les bibliothèques ICU dont dépend l'extension SQLite avec leurs données complètes (sous Debian,
# l'image finale les installe par apt).
RUN mkdir -p /runtime/usr/bin /runtime/usr/lib && \
    case "$TARGETARCH" in \
      arm64) KEPUB=kepubify-linux-arm64 ;; \
      arm) KEPUB=kepubify-linux-arm ;; \
      *) KEPUB=kepubify-linux-64bit ;; \
    esac && \
    wget -q "https://github.com/pgaskin/kepubify/releases/latest/download/$KEPUB" -O /runtime/usr/bin/kepubify && \
    chmod +x /runtime/usr/bin/kepubify && \
    if [ -f /etc/alpine-release ]; then \
      for lib in $(ldd build/komgasqlite.so | awk '/libicu/ { print $3 }'); do cp -L "$lib" /runtime/usr/lib/; done && \
      ls /runtime/usr/lib | grep -q libicui18n && \
      mkdir -p /runtime/usr/share && cp -r /usr/share/icu /runtime/usr/share/icu; \
    fi

# --- Base de l'image finale, par architecture --------------------------------------------------
FROM smeagolworms4/node-pointer-compression:24-alpine-slim AS runner-base-alpine

FROM node:22-bookworm-slim AS runner-base-debian
RUN apt-get update && \
    apt-get install -y --no-install-recommends libicu72 ca-certificates locales && \
    echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen && locale-gen en_US.UTF-8 && \
    rm -rf /var/lib/apt/lists/*

FROM runner-base-alpine AS runner-base-amd64
FROM runner-base-alpine AS runner-base-arm64
FROM runner-base-debian AS runner-base-arm

# --- Image finale : des copies ---------------------------------------------------------------
FROM runner-base-${TARGETARCH} AS runner
WORKDIR /app
COPY --from=build /runtime/ /
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/build/komgasqlite.so /app/build/komgajpeg.node /app/build/komgabcrypt.node /app/build/komgazxing.node ./build/
COPY --from=build /app/resources ./resources
COPY --from=build /app/native/jdk-profiles ./native/jdk-profiles
COPY --from=build /app/bin ./bin
VOLUME /config
# LANG et MALLOC_ARENA_MAX concernent glibc (armv7) : musl est toujours en UTF-8 et n'a pas d'arènes.
ENV KOMGA_CONFIGDIR="/config" \
    SPRING_PROFILES_ACTIVE="docker" \
    LANG='en_US.UTF-8' LANGUAGE='en_US:en' LC_ALL='en_US.UTF-8' \
    MALLOC_ARENA_MAX=2 \
    NODE_ENV=production
EXPOSE 25600
ENTRYPOINT ["/app/bin/komgajs"]
LABEL org.opencontainers.image.source="https://github.com/Smeagolworms4/komga-js" \
      org.opencontainers.image.description="KomgaJS: Komga's backend ported to TypeScript, with Komga's web UI" \
      org.opencontainers.image.licenses="MIT"
