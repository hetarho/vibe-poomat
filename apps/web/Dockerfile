# syntax=docker/dockerfile:1.7-labs

FROM node:22-bookworm-slim AS base
RUN npm install --global pnpm@10.30.3
WORKDIR /repo

FROM base AS deps
# every workspace manifest, and nothing else, so this layer caches on
# dependency changes alone and a new package needs no edit here
COPY --parents pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY --parents apps/*/package.json packages/*/package.json ./
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
