# STATE
> spec control tower. Every agent: ① read this file before working ② write the start to log BEFORE questioning/reasoning/implementing ③ reflect every state change here immediately.
> State only. Content truth: ssot/. Task detail: tasks/. Notation: FORMAT.md.

## cfg
- level: expert  # expert|mid|novice
- lang: ko      # user's language — interviews, confirmations, reports
- docs: en  # doc language

## ideation
| id | st |
|---|---|
| vibe-showcase | converted@260906 |

## ssot
| id | rev | tasked | pending | [?] |
|---|---|---|---|---|
| ARCH | 2 | 2 | - | 0 |
| AUTH | 2 | 2 | - | 0 |
| PROJ | 2 | 2 | - | 0 |
| FDBK | 2 | 2 | - | 0 |
| CRED | 2 | 2 | - | 0 |
| NOTI | 2 | 2 | - | 0 |

## tasks
| id | title | ssot | dep | st |
|---|---|---|---|---|
| T019 | session guard, me & logout | AUTH ARCH | T018 | todo |
| T020 | profile read & update | AUTH CRED ARCH | T019 T014 | todo |
| T021 | credit ledger context | CRED AUTH ARCH | T018 T012 | todo |
| T022 | project context: create, update, delete | PROJ ARCH | T019 T015 | todo |
| T023 | mission lifecycle & escrow | PROJ CRED ARCH | T022 T021 T012 | todo |
| T024 | feed, popular & upvote | PROJ ARCH | T022 | todo |
| T025 | feedback slots: claim & release | FDBK PROJ ARCH | T023 T012 | todo |
| T026 | feedback report submit | FDBK ARCH | T025 | todo |
| T027 | feedback settle: accept, reject, auto-accept | FDBK CRED PROJ ARCH | T026 T021 T012 | todo |
| T028 | feedback thread | FDBK AUTH ARCH | T026 | todo |
| T029 | maker rejection stats | FDBK CRED AUTH | T027 | todo |
| T030 | notification context: events, emails & preferences | NOTI AUTH ARCH | T013 T027 | todo |
| T031 | account deletion | AUTH CRED PROJ FDBK ARCH | T027 T023 T021 | todo |
| T032 | web: auth shell & sign-in | AUTH ARCH | T008 T019 | todo |
| T033 | web: profile & settings | AUTH CRED FDBK ARCH | T032 T020 T021 | todo |
| T034 | web: project create & edit | PROJ ARCH | T032 T022 T014 | todo |
| T035 | web: feed, project detail & upvote | PROJ ARCH | T032 T024 | todo |
| T036 | web: mission management | PROJ CRED ARCH | T035 T023 | todo |
| T037 | web: slot claim & report form | FDBK ARCH | T035 T025 T026 | todo |
| T038 | web: feedback view, settle & thread | FDBK CRED ARCH | T037 T027 T028 | todo |
| T039 | web: notification settings & unsubscribe | NOTI ARCH | T032 T030 | todo |
| T040 | e2e core flows | ARCH AUTH PROJ FDBK CRED | T038 T036 T033 | todo |

## next
- implement-task T019 — the session guard, /me and logout, which the rest of the API waits on
- order: T019-T021 auth+credit → T022-T031 project/feedback/notification → T032-T040 web+e2e
- before the first deploy run, set the repository variables and secrets listed in the .github/workflows/deploy.yml header (now including the four OAuth ones); review-code after the backend contexts land (around T031)

## log
- 260908 T018 done: arctic OAuth start+callback behind redirect-only endpoints, sign-in use case with all four AUTH-5 branches, session cookie + rotation, AccountCreated after commit; arctic is ESM so it loads via import() in the module factory
- 260908 note: 4 pre-existing biome warnings in shared int tests (unused import/var, non-null assertion) — candidates for review-code
- 260908 T017 done: auth schema (citext handle, partial verified-email index), User/Session/ProviderIdentity domain, three Drizzle repositories; isUniqueViolation now walks Drizzle's cause chain
- 260908 T016 done: GHCR buildx push, ssh+compose roll behind Caddy with migrate-first and a tag roll back; docker-smoke.sh gained SMOKE_REMOTE; actionlint wrapper now ignores its stale vars context
- 260907 T014 done: S3/MinIO FileStorage with signed content-type+length, uploads endpoint, delete job; openapi generator now uses Nest preview mode
- 260907 T015 done: SSRF-guarded undici probe, PG-backed throttler with trustProxy=1, first real migration; fixed migrate running a stale image
- 260907 T013 done: @repo/email templates, console+Resend adapters, email.send job with PermanentJobFailure dead-lettering; Dockerfiles now copy every workspace manifest
- 260907 T012 done: pg-boss 11 scheduler joining the ambient tx, queue-level retry+dead-letter, JOBS_ENABLED; tx manager rewritten to pool-based for the raw connection
- 260907 T011 done: ALS transaction manager with getDb(), post-commit in-process event bus with an in-transaction guard
- 260907 T010 done: distroless images for api+web, compose stack with a one-shot migrate service, docker-smoke.sh green end to end
- 260907 T009 done: PR workflow (affected verify + coverage gate + contract check + playwright), actionlint in turbo lint
- 260907 T008 done: per-request QueryClient with SSR hydration, api client + error copy, zustand convention in shared/model; @repo/config gained a ./web entry
- 260907 T007 claimed (op5)
- 260907 T007 done: TanStack Start SSR shell, FSD+Steiger, tailwind v4+shadcn seed, vitest jsdom; vitest catalog 3.2.7->4.1.11 (vite 8); e2e written but unrun (no browser libs)
- 260907 T006 done: @repo/contracts zod schemas, OpenAPI 3.1 generator, @repo/api-client with ApiError middleware, contract staleness check
- 260907 T005 done: drizzle+pg DbModule, compose pg, Testcontainers int harness; fixed pool error crash and flaky hook timeout
- 260907 T004 done: kernel(VO/Entity/AggregateRoot/EntityId), neverthrow Result, DomainError->HTTP map, dependency-cruiser layering
- 260907 T003 done: NestJS+Fastify skeleton, pino reqId, readiness registry; biome useImportType off for apps/api (NestJS DI)
- 260907 T002 done: @repo/config zod env, CJS package build convention, no-process-env guard
- 260907 T001 done: pnpm/turbo workspace + biome + vitest projects + husky, verify loop green
