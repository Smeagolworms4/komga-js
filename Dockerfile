# KomgaJS : le backend porté de Komga, avec les interfaces web de Komga (komga-webui et next-ui)
# construites depuis le même commit que celui porté (UPSTREAM_REF).
# Même usage que l'image de Komga : volume /config, port 25600, bibliothèques montées où l'on veut.

# --- Sources de Komga, au commit porté -------------------------------------------------------
FROM alpine/git:2.47.2 AS komga-src
ARG KOMGA_REF
RUN test -n "$KOMGA_REF" && \
    git clone --filter=blob:none --no-checkout https://github.com/gotson/komga.git /komga && \
    git -C /komga checkout "$KOMGA_REF"

# --- Interfaces web (versions de Node de leurs .nvmrc) ---------------------------------------
FROM node:22-bookworm AS webui
COPY --from=komga-src /komga/komga-webui /webui
WORKDIR /webui
RUN npm ci --no-audit --no-fund && npm run build

FROM node:24-bookworm AS nextui
COPY --from=komga-src /komga/next-ui /nextui
WORKDIR /nextui
RUN npm ci --no-audit --no-fund && npm run build

# --- KomgaJS : modules natifs (ICU, libjpeg 6b + LittleCMS) et compilation TypeScript ---------
FROM node:24-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends libicu-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
COPY --from=webui /webui/dist /tmp/webui
COPY --from=nextui /nextui/dist /tmp/nextui
RUN npm run build:native && \
    npm run build && \
    node tools/install-webui.mjs /tmp/webui /tmp/nextui && \
    npm prune --omit=dev

# --- Image finale ------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runner
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
COPY --from=build /app/build/komgasqlite.so /app/build/komgajpeg.node ./build/
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
