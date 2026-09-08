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
- implement-task T026 — the feedback report submit, on top of a held claim
- order: T026-T031 feedback/notification → T022-T031 project/feedback/notification → T032-T040 web+e2e
- before the first deploy run, set the repository variables and secrets listed in the .github/workflows/deploy.yml header (now including the four OAuth ones); review-code after the backend contexts land (around T031)

## log
- 260908 note: PROJ-9 ranks on "has an open mission" not "has a takeable slot" — coarse once slots can be held (T024/T025 results); candidate for create-task
- 260908 T025 done: 24h slot holds with FDBK-2 as a partial unique index, advisory-lock race on the last slot, release job + manual release; both project stubs replaced by the real claim store
- 260908 T024 done: single-statement feed with a computed rank and keyset cursor, 7-day popular window, transactional upvote toggle; fixed ORDER BY 0 being an ordinal and a fractional-epoch keyset returning a row twice
- 260908 T023 done: missions with escrow-on-open in one transaction, PROJ-5 as a partial unique index, close/expire refunding only unheld slots, expiry job + slot-settled completion handler; CREDIT_OPERATIONS published as the ledger write port
- 260908 T022 done: project context with probe-verified live url, PROJ-7/8 mission locks behind an ACTIVE_MISSION_READER port stubbed until T023, soft delete owner-only; SessionGuard now identifies the caller on @Public() routes too
- 260908 T021 done: append-only ledger with cached balances, five named operations idempotent on their (type,account,ref) key, seed on AccountCreated, /credits/me; randomised invariant + concurrent-escrow int tests
- 260908 T020 done: Avatar VO (provider URL or upload key), public profile by handle, PATCH me + me/handle, credits reserved at zero; fixed DrizzleTransactionManager committing partial writes behind an errored Result (ARCH-38)
- 260908 T019 done: global SessionGuard with @Public in shared/presentation, /auth/me + /auth/logout, hourly session.cleanup via a new JobHandler.cron; uploads is now authenticated, smoke asserts the 401
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
