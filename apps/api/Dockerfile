# syntax=docker/dockerfile:1.7-labs

FROM node:22-bookworm-slim AS base
RUN npm install --global pnpm@10.30.3
WORKDIR /repo

FROM base AS deps
# every workspace manifest, and nothing else, so this layer caches on
# dependency changes alone and a new package needs no edit here
COPY --parents pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY --parents apps/*/package.json packages/*/package.json ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
RUN pnpm turbo run build --filter=api
# leaves only this app plus its production dependencies under /app
RUN pnpm deploy --legacy --filter=api --prod /app

# distroless has no shell, so nothing may RUN past this line
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /app/node_modules ./node_modules
COPY --from=build --chown=nonroot:nonroot /app/dist ./dist
COPY --from=build --chown=nonroot:nonroot /repo/apps/api/drizzle ./drizzle
USER nonroot
ENV NODE_ENV=production
EXPOSE 3001
CMD ["dist/main.js"]
