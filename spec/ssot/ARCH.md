# ARCH architecture
> r1 | Technical foundation every task follows: stack, structure, conventions, verify, CI/CD, deploy

## decisions
- ARCH-1 [o] platform: web service (browser SSR/SPA + REST API); mobile out of scope
- ARCH-2 [o] language: TypeScript everywhere (web, api, packages, tooling), `strict: true`, no `any` without `// why:` comment
- ARCH-3 [o] runtime/tooling: Node 22 LTS · pnpm 10 · Turborepo · Vitest · Biome
- ARCH-4 [o] repo: pnpm workspace monorepo — `apps/web` `apps/api` `packages/*` ← type/contract sharing without publishing packages
- ARCH-5 [o] frontend: TanStack Start (React 19, file routes, SSR) ← type-safe routing; FSD lives in `src/`, `app/routes/` stays thin
- ARCH-6 [o] frontend architecture: Feature-Sliced Design — layers `app → pages → widgets → features → entities → shared`; import only downward; slice public API via `index.ts` only; boundaries enforced by Steiger
- ARCH-7 [o] frontend state: TanStack Query for server state, Zustand for cross-slice client state only; local UI state stays in component
- ARCH-8 [o] styling: Tailwind v4 + shadcn/ui; shadcn components owned in `shared/ui`
- ARCH-9 [o] backend: NestJS 11 (Fastify adapter) ← built-in DI maps Clean ports/adapters to providers; one Nest module per bounded context
- ARCH-10 [o] backend architecture: DDD + Clean — per context `domain/` (entities, value objects, domain events, repository interfaces) → `application/` (use cases, ports, DTOs) → `infrastructure/` (Drizzle repositories, external adapters) → `presentation/` (controllers, request/response schemas); dependency direction inward only, enforced by dependency-cruiser
- ARCH-11 [o] domain purity: `domain/` and `application/` import no framework (no Nest, Drizzle, HTTP); DI tokens are interfaces + `Symbol` tokens
- ARCH-12 [o] errors: `Result<T, DomainError>` via neverthrow in domain/application; presentation maps to HTTP via one exception filter + result mapper; `throw` only for programmer errors ← expected failures visible in types
- ARCH-13 [o] data: PostgreSQL 16 + Drizzle ORM; schema in `apps/api/src/<context>/infrastructure/persistence/schema.ts`; migrations via `drizzle-kit generate` committed to repo, applied on deploy
- ARCH-14 [o] schema principles: UUIDv7 primary keys · `created_at`/`updated_at` timestamptz on every table · soft delete only when SSOT requires · one schema per bounded context, no cross-context FK (reference by id)
- ARCH-15 [o] validation: zod at boundaries — `nestjs-zod` DTOs in presentation, zod in `packages/contracts` shared with web; domain invariants live in value objects, not zod
- ARCH-16 [o] API contract: REST + OpenAPI 3.1 generated from Nest (`@nestjs/swagger` + nestjs-zod) → `openapi-typescript` client in `packages/api-client`; web consumes generated types only ← external-consumer friendly, tool-compatible
- ARCH-17 [o] API conventions: `/api/v1/<resource>` plural nouns · JSON · errors `{ code, message, details? }` with stable `code` per DomainError · pagination cursor-based
- ARCH-18 [o] auth: self-built session cookie — httpOnly, Secure, SameSite=Lax; session id opaque random 256-bit; `auth` bounded context owns users/credentials/sessions; passwords argon2id
- ARCH-19 [o] session store: PostgreSQL `sessions` table behind `SessionStore` port ← zero extra infra; swap to Redis by adapter only
- ARCH-20 [o] naming: files kebab-case · types/classes PascalCase · functions/vars camelCase · DB snake_case · use case class `<Verb><Noun>UseCase` · repository interface `<Noun>Repository`, adapter `Drizzle<Noun>Repository`
- ARCH-21 [o] tests mandatory: domain/application unit (Vitest, no IO, in-memory fakes) · infrastructure integration (Vitest + Testcontainers PG) · presentation contract test per endpoint · web: unit per feature/entity (Vitest + Testing Library) · E2E core flows only (Playwright) ← fast inner loop, real DB where it matters
- ARCH-22 [o] test placement: colocated `*.test.ts` · integration `*.int.test.ts` · e2e `apps/web/e2e/` · coverage gate 80% lines on domain+application
- ARCH-23 [o] lint/format: Biome (lint+format) · Steiger (FSD) · dependency-cruiser (Clean layers) · `tsc --noEmit` per package
- ARCH-24 [o] verify test: `pnpm turbo run test`
- ARCH-25 [o] verify lint: `pnpm turbo run lint typecheck`
- ARCH-26 [o] verify format: `pnpm biome format --write .`
- ARCH-27 [o] git: trunk-based on `main` · short-lived branches · Conventional Commits · squash merge · Husky + lint-staged runs `biome check --staged`
- ARCH-28 [o] CI: GitHub Actions — PR: `pnpm turbo run lint typecheck test build --filter=...[origin/main]` + Playwright on web; main: build Docker images, push to GHCR, deploy
- ARCH-29 [o] deploy: Docker image per app (`apps/web`, `apps/api`, multi-stage, distroless node) · managed PostgreSQL · `docker-compose.yml` for local parity (web, api, pg)
- ARCH-30 [?] deploy target: single VPS (docker compose + Caddy) vs Fly.io — decide before first deploy task
- ARCH-31 [o] config: env via `process.env` validated once at boot with zod (`packages/config`); no env reads outside that module; `.env.example` committed
- ARCH-32 [o] observability: pino JSON logs with request id · `/health` `/ready` endpoints; metrics/tracing deferred until SSOT demands
- ARCH-33 [o] cache: none at start; TanStack Query is the only cache layer ← avoid premature infra
- ARCH-34 [o] folder structure:
  ```
  apps/web/            TanStack Start
    app/routes/        thin route files → pages layer
    src/{app,pages,widgets,features,entities,shared}/<slice>/{ui,model,api,lib}/ + index.ts
    e2e/
  apps/api/            NestJS
    src/main.ts, app.module.ts
    src/shared/{kernel,result,db}/          base Entity·ValueObject·DomainEvent, Drizzle client
    src/<context>/{domain,application,infrastructure,presentation}/ + <context>.module.ts
    drizzle/           generated migrations
  packages/contracts/  zod schemas shared web↔api
  packages/api-client/ openapi-typescript output + openapi-fetch wrapper
  packages/config/     env schema
  packages/tsconfig/   base tsconfigs
  .github/workflows/   ci.yml deploy.yml
  docker-compose.yml turbo.json biome.json pnpm-workspace.yaml
  ```

## flow
- request: web(feature api hook) → api-client → controller(zod DTO) → use case → domain → repository port → Drizzle adapter → PG
- error: DomainError(Result) → result mapper → HTTP `{code,message}` → api-client typed error → feature UI
- auth: login use case → argon2 verify → SessionStore.create → Set-Cookie → guard reads cookie → SessionStore.find → request.user

## constraints
- domain/application never import from infrastructure/presentation or any framework
- FSD slices import only lower layers and only through `index.ts`
- web never hand-writes API types; regenerate `packages/api-client` when OpenAPI changes
- every task's acceptance includes tests per ARCH-21 unless ARCH gains an explicit [o] exemption
- no cross-context DB joins; cross-context reads go through application services

## chg
- r1 260906 initial
