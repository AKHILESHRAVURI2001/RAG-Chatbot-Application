
# ---- Stage 1: install everything and compile TypeScript -> dist/ ----
FROM node:20-alpine AS build
WORKDIR /app

# Copy just the manifest files first so Docker can cache the (slow)
# `npm ci` layer and skip it on future builds where only source code changed.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
RUN npm ci

COPY apps/server apps/server
RUN npm run build -w apps/server

# ---- Stage 2: a clean image with only what's needed to *run* the app ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
RUN npm ci --omit=dev --workspace=apps/server

COPY --from=build /app/apps/server/dist apps/server/dist
COPY apps/server/db apps/server/db
COPY apps/server/scripts apps/server/scripts

USER node

EXPOSE 4000
CMD ["node", "apps/server/dist/index.js"]
