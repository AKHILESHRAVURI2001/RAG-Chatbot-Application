FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/widget/package.json apps/widget/package.json
RUN npm ci

COPY apps/widget apps/widget
RUN npm run build -w apps/widget

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/widget/dist/widget.js /usr/share/nginx/html/widget.js

RUN printf 'server { \n\
  listen 80; \n\
  root /usr/share/nginx/html; \n\
  location /widget.js { \n\
    add_header Content-Type application/javascript; \n\
    add_header Cache-Control "public, max-age=300"; \n\
  } \n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
