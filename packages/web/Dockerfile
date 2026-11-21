# Build context is the repo root (see compose.yaml).
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/ml/package.json packages/ml/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile --filter @hitl/web...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/web packages/web
WORKDIR /repo/packages/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
# Standalone output keeps the monorepo layout: server.js sits under packages/web.
COPY --from=build --chown=app:app /repo/packages/web/.next/standalone ./
COPY --from=build --chown=app:app /repo/packages/web/.next/static ./packages/web/.next/static
COPY --from=build --chown=app:app /repo/packages/web/public ./packages/web/public
USER app
EXPOSE 3000
CMD ["node", "packages/web/server.js"]
