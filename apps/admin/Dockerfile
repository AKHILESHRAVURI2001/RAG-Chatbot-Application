# ---- Stage 1: build the static React app ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/package.json
RUN npm ci

COPY apps/admin apps/admin

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build -w apps/admin

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html

RUN printf 'server { \n\
  listen 80; \n\
  root /usr/share/nginx/html; \n\
  location / { try_files $uri /index.html; } \n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
