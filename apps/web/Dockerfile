# syntax=docker/dockerfile:1
#
# BUILD CONTEXT MUST BE THE REPO ROOT — same npm-workspaces reasoning as
# apps/api/Dockerfile. Build from the repo root:
#   docker build -f apps/web/Dockerfile -t inventory-web \
#     --build-arg VITE_API_URL=https://api.example.com/api \
#     --build-arg VITE_WS_URL=https://api.example.com .
# Vite bakes VITE_* vars into the static bundle at build time, not runtime —
# there is no .env to change after the image is built; a new image is needed
# per target API URL (typical for a static SPA deploy, not unique to this app).

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm ci
COPY apps/web apps/web
COPY packages/shared-types packages/shared-types
ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
RUN npm run build --workspace=web

FROM nginx:alpine AS runtime
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
# SPA fallback: any path Nginx doesn't recognize as a static file should
# still serve index.html so React Router's client-side routes (e.g. a
# hard-refresh on /shop/products/42) resolve instead of 404ing at the edge.
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / {\n    try_files $uri /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80 || exit 1
CMD ["nginx", "-g", "daemon off;"]
