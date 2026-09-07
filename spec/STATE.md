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
| T012 | pg-boss job infrastructure | ARCH | T011 | todo |
| T013 | mailer port, Resend adapter & email templates | ARCH | T012 | todo |
| T014 | object storage & presigned uploads | ARCH | T006 | todo |
| T015 | outbound HTTP probe & rate limiting | ARCH | T003 | todo |
| T016 | deploy pipeline | ARCH | T009 T010 | todo |
| T017 | auth context: schema & domain model | AUTH ARCH | T011 | todo |
| T018 | OAuth sign-in & session issue | AUTH ARCH | T017 | todo |
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
- implement-task T012 — transactions are in place, so jobs can be enqueued inside them
- order: T012-T016 infra → T017-T021 auth+credit → T022-T031 project/feedback/notification → T032-T040 web+e2e
- review-code after the backend contexts land (around T031) before the web tasks

## log
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
- 260907 create-narrative done: NARRATIVE.md refreshed to ARCH@2 + domains r2 + T001..T040
- 260907 create-task done: ARCH r2 delta → T011..T016; AUTH CRED PROJ FDBK NOTI → T017..T040 (40 tasks total)
- 260907 create-task ARCH(r2 delta) AUTH PROJ CRED FDBK NOTI start
- 260907 update-ssot done: AUTH PROJ CRED FDBK NOTI r2 — all open [?] closed
- 260907 update-ssot AUTH PROJ CRED FDBK NOTI start (resolve open [?])
- 260907 create-architecture done: ARCH r2 (ARCH-18✎ OAuth-only, ARCH-30✎ VPS+Caddy, ARCH-35..41+ jobs·mail·storage·tx·events·http·throttle)
- 260907 create-narrative done: NARRATIVE.md (reader: future self, as of all@r1)
- 260907 create-architecture start (ARCH revise: ARCH-18 OAuth-only, ARCH-30, infra gaps)
