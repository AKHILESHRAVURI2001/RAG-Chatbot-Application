
# ---- Stage 1: install everything and compile TypeScript -> dist/ ----
FROM node:20-slim AS build
WORKDIR /app

# Copy just the manifest files first so Docker can cache the (slow)
# `npm ci` layer and skip it on future builds where only source code changed.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
RUN npm ci

COPY apps/server apps/server
RUN npm run build -w apps/server

# ---- Stage 2: a clean image with only what's needed to *run* the app ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Where the search model is stored. It is downloaded once, at build time, so the
# server starts fast and does not need the internet for it.
ENV TRANSFORMERS_CACHE=/app/model-cache

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
RUN npm ci --omit=dev --workspace=apps/server

COPY --from=build /app/apps/server/dist apps/server/dist
COPY apps/server/db apps/server/db
COPY apps/server/scripts apps/server/scripts

# Download the search model into the image (glibc base image: the native runtime
# behind it does not run on Alpine), then let the non-root user read it.
RUN node -e "import('@xenova/transformers').then(async (m) => { m.env.cacheDir = process.env.TRANSFORMERS_CACHE; await m.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true }); })" \
  && chown -R node:node /app/model-cache

USER node

EXPOSE 4000
CMD ["node", "apps/server/dist/index.js"]
