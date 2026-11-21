# One-shot container that applies migrations, then exits.
FROM node:22-alpine
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/ml/package.json packages/ml/
RUN pnpm install --frozen-lockfile --filter @hitl/db...
COPY packages/shared packages/shared
COPY packages/db packages/db
WORKDIR /repo/packages/db
CMD ["pnpm", "migrate"]
