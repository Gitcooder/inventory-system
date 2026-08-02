# syntax=docker/dockerfile:1
#
# BUILD CONTEXT MUST BE THE REPO ROOT, not apps/api — this is an npm
# workspaces monorepo, so `npm ci` needs the root package.json + lockfile to
# resolve correctly, not just this workspace's package.json in isolation.
# Build from the repo root:
#   docker build -f apps/api/Dockerfile -t inventory-api .
# (docker-compose.yml's `api` service is already configured this way.)

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm ci
COPY apps/api apps/api
COPY packages/shared-types packages/shared-types
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build --workspace=api

FROM node:22-alpine AS runtime
# wget for the HEALTHCHECK below (alpine has no curl by default); a
# dedicated non-root user so the process isn't running as root in production.
RUN apk add --no-cache wget && addgroup -S app && adduser -S app -G app
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm ci --omit=dev
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/prisma apps/api/prisma
COPY --from=build /repo/node_modules/.prisma node_modules/.prisma
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
# Compiled entry is dist/src/main.js, not dist/main.js — nest-cli.json's
# sourceRoot is "src", so tsc preserves that folder under dist/. Verified by
# actually building and inspecting dist/ during Phase 8, not assumed.
CMD ["node", "apps/api/dist/src/main.js"]
