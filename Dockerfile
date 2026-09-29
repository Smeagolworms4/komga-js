# KomgaJS : le backend porté de Komga, avec les interfaces web de Komga (komga-webui et next-ui)
# construites depuis le même commit que celui porté (UPSTREAM_REF).
# Même usage que l'image de Komga : volume /config, port 25600, bibliothèques montées où l'on veut.
#
# Plateformes : linux/amd64 et linux/arm64 sur Node 24 (celle des tests), linux/arm/v7 sur Node 22 LTS : Node 24 n'a
# plus de binaire armv7 (ni officiel, ni non officiel, pas d'image node:24 arm/v7). Node 22 est testé en CI
# (build.yml, job « Node 22 ») ; fin de support de Node 22 : avril 2027.
ARG TARGETARCH

# --- Sources de Komga, au commit porté -------------------------------------------------------
FROM --platform=$BUILDPLATFORM alpine/git:2.47.2 AS komga-src
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

# --- Node par architecture (voir en tête) ------------------------------------------------------
FROM node:24-bookworm AS node-build-amd64
FROM node:24-bookworm AS node-build-arm64
FROM node:22-bookworm AS node-build-arm
FROM node:24-bookworm-slim AS node-runner-amd64
FROM node:24-bookworm-slim AS node-runner-arm64
FROM node:22-bookworm-slim AS node-runner-arm

# --- KomgaJS : modules natifs (ICU, libjpeg 6b + LittleCMS, bcrypt, ZXing) et compilation TypeScript
FROM node-build-${TARGETARCH} AS build
RUN apt-get update && apt-get install -y --no-install-recommends libicu-dev && rm -rf /var/lib/apt/lists/*
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
    fi
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

# --- Image finale ------------------------------------------------------------------------------
FROM node-runner-${TARGETARCH} AS runner
ARG TARGETARCH
RUN apt-get update && \
    apt-get install -y --no-install-recommends libicu72 ca-certificates locales wget && \
    echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen && locale-gen en_US.UTF-8 && \
    case "$TARGETARCH" in \
      arm64) KEPUB=kepubify-linux-arm64 ;; \
      arm) KEPUB=kepubify-linux-arm ;; \
      *) KEPUB=kepubify-linux-64bit ;; \
    esac && \
    wget -q "https://github.com/pgaskin/kepubify/releases/latest/download/$KEPUB" -O /usr/bin/kepubify && \
    chmod +x /usr/bin/kepubify && \
    apt-get purge -y wget && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/build/komgasqlite.so /app/build/komgajpeg.node /app/build/komgabcrypt.node /app/build/komgazxing.node ./build/
COPY --from=build /app/resources ./resources
COPY --from=build /app/native/jdk-profiles ./native/jdk-profiles
COPY --from=build /app/bin ./bin
VOLUME /config
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
