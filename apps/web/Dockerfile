# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
RUN npm install --global pnpm@10.30.3
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/tsconfig/package.json packages/tsconfig/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm turbo run build --filter=web

# nitro bundles the server, so the runtime image needs no node_modules at all
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /repo/apps/web/.output ./.output
USER nonroot
ENV NODE_ENV=production
EXPOSE 3000
CMD [".output/server/index.mjs"]
