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
| T034 | web: project create & edit | PROJ ARCH | T032 T022 T014 | todo |
| T035 | web: feed, project detail & upvote | PROJ ARCH | T032 T024 | todo |
| T036 | web: mission management | PROJ CRED ARCH | T035 T023 | todo |
| T037 | web: slot claim & report form | FDBK ARCH | T035 T025 T026 | todo |
| T038 | web: feedback view, settle & thread | FDBK CRED ARCH | T037 T027 T028 | todo |
| T039 | web: notification settings & unsubscribe | NOTI ARCH | T032 T030 | todo |
| T040 | e2e core flows | ARCH AUTH PROJ FDBK CRED | T038 T036 T033 | todo |

## next
- implement-task T034 — web project create & edit, or T035 the feed; both are unblocked
- order: T033-T039 web → T040 e2e; the api is complete
- before the first deploy run, set the repository variables and secrets listed in the .github/workflows/deploy.yml header (now including the four OAuth ones and NOTIFICATION_SECRET); review-code is now due — the whole api is written
- update-ssot candidate: AUTH-9 says a deleted account's projects are "deleted"; they are hidden, because FDBK-9 keeps the reports about them public (T031 result)

## log
- 260908 T033 done: /@handle profile with CRED-7 counters and FDBK-8 stats, settings with avatar presign, handle change, notification toggles and AUTH-9 deletion; the feed gained ?owner= and GET /users/:authorId/feedbacks was added, because the profile lists had no endpoint at all
- 260908 note: create-task candidates — annotate the api's responses with DTOs so the generated client is typed both ways (shared/api/body.ts exists only for that), and the two profile endpoints deserved a task of their own
- 260908 T032 done: session resolved once in the root beforeLoad with the cookie forwarded during SSR, so the header never flashes the wrong state; sign-in as a dialog carrying returnTo, /sign-in for the callback's ?error=, requireSession as a beforeLoad guard; smoke now asserts the server-rendered header
- 260908 note: the account menu links to /users/:handle and /settings with plain anchors — T033 turns them into typed Links once those routes exist
- 260908 T031 done: AUTH-9's sequence across four contexts in one transaction, each asked through its own port, with the step order exported and asserted; pending reports found by maker_id because closing a mission settles nothing; the session cookie's name moved to shared/presentation so deletion can clear it
- 260908 T030 done: notification context subscribing to five published events for NOTI-2's seven email types, lazy per-type opt-out with the credit-moving warning always on, HMAC unsubscribe links, seven React Email templates; each event's published payload is now declared in the kernel and implemented by the emitting class
- 260908 note: web must build /feedbacks/:id, /projects/:id and /settings/notifications — every notification email deep-links to them (T032-T039)
- 260908 T029 done: FDBK-8 rejection rate and reason distribution on every profile, one grouped aggregate over a denormalised feedbacks.maker_id rather than a cross-context join to projects; ClaimStoreModule moved to its own file so AuthModule can name it instead of relying on @Global()
- 260908 note: four auth/credit use cases each take storage+credits+makerStats to build one profile view — a ProfileComposer would collapse that; candidate for review-code
- 260908 T028 done: flat two-party thread on each report, participants resolved per request rather than stored, public keyset read oldest-first, ThreadReplied for T030; the page now walks (created_at, id) so the mandated index is the one it uses
- 260908 T027 done: accept/reject/auto-accept through one settle path with identical credit movement, 48h warn + 72h auto-accept bodies, SlotSettled completing the mission; fixed three repositories never draining their aggregates' events (T023 MissionEnded had been going nowhere)
- 260908 T026 done: fixed-shape report with per-field 20-char rule, immutable by having no update path, slot flipped to submitted and FDBK-7 timers started; the two timer queues registered with logging placeholders for T027
- 260908 note: PROJ-9 ranks on "has an open mission" not "has a takeable slot" — coarse once slots can be held (T024/T025 results); candidate for create-task
- 260908 T025 done: 24h slot holds with FDBK-2 as a partial unique index, advisory-lock race on the last slot, release job + manual release; both project stubs replaced by the real claim store
- 260908 T024 done: single-statement feed with a computed rank and keyset cursor, 7-day popular window, transactional upvote toggle; fixed ORDER BY 0 being an ordinal and a fractional-epoch keyset returning a row twice
- 260908 T023 done: missions with escrow-on-open in one transaction, PROJ-5 as a partial unique index, close/expire refunding only unheld slots, expiry job + slot-settled completion handler; CREDIT_OPERATIONS published as the ledger write port
- 260908 T022 done: project context with probe-verified live url, PROJ-7/8 mission locks behind an ACTIVE_MISSION_READER port stubbed until T023, soft delete owner-only; SessionGuard now identifies the caller on @Public() routes too
- 260908 T021 done: append-only ledger with cached balances, five named operations idempotent on their (type,account,ref) key, seed on AccountCreated, /credits/me; randomised invariant + concurrent-escrow int tests
- 260908 T020 done: Avatar VO (provider URL or upload key), public profile by handle, PATCH me + me/handle, credits reserved at zero; fixed DrizzleTransactionManager committing partial writes behind an errored Result (ARCH-38)
- 260908 T019 done: global SessionGuard with @Public in shared/presentation, /auth/me + /auth/logout, hourly session.cleanup via a new JobHandler.cron; uploads is now authenticated, smoke asserts the 401
