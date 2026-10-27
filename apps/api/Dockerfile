# syntax=docker/dockerfile:1
# Core Backend image. Build context: repository root.

FROM node:22-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@srm/api..."
COPY packages/shared packages/shared
COPY apps/api apps/api
# Builds @srm/shared first (dependency order), then the API.
RUN pnpm --filter "@srm/api..." build
# Self-contained production bundle: dist + prod node_modules (shared copied in, not symlinked).
# --legacy: pnpm 10 otherwise requires injectWorkspacePackages, which changes local linking.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter @srm/api deploy --prod --legacy /out

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
