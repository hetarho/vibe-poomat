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
| T037 | web: slot claim & report form | FDBK ARCH | T035 T025 T026 | todo |
| T038 | web: feedback view, settle & thread | FDBK CRED ARCH | T037 T027 T028 | todo |
| T039 | web: notification settings & unsubscribe | NOTI ARCH | T032 T030 | todo |
| T040 | e2e core flows | ARCH AUTH PROJ FDBK CRED | T038 T036 T033 | todo |

## next
- implement-task T037 — slot claim & report form; T039 notification settings is also unblocked
- order: T037 → T038 → T039 → T040 e2e
- before the first deploy run, set the repository variables and secrets listed in the .github/workflows/deploy.yml header (now including the four OAuth ones and NOTIFICATION_SECRET); review-code is now due — the whole api is written
- update-ssot candidates: AUTH-9 says a deleted account's projects are "deleted"; they are hidden, because FDBK-9 keeps the reports about them public (T031). PROJ-7 does not say whether the title is frozen with the URL; T034 froze it and the api does not (T034)

## log
- 260908 T036 done: PROJ-13's open-mission form with CRED-3's cost against a live balance, one MissionPanel showing PROJ-6 state and the FDBK-1 slot breakdown plus PROJ-7's frozen task, PROJ-6 close behind a confirmation stating both halves of CRED-5; the api gained GET /projects/:id/missions (no mission was readable at all) and an occupancy breakdown on the response
- 260908 note: an ended mission's refund summary is derived from the current occupancy because refundedSlots lives only on the MissionEnded event — check whether releasing a held slot after the mission ended refunds it (review-code)
- 260908 T036 claimed (wb)
- 260908 T035 done: PROJ-9/PROJ-10 as two tabs over one card and one paging widget, PROJ-3's filter in the URL and honoured by the SSR loader, optimistic PROJ-11 upvoting patched into every cached feed and the project, PROJ-8's archived banner; the api gained GET /projects/:id/feedbacks (its public feedback was unreachable once a mission ended) and upvotedByViewer on the project read
- 260908 note: web feed loaders prefetch rather than ensure — an ensure rethrows and would blank the public landing page when the api blips; the same applies to any public route added later
- 260908 T035 claimed (wb)
- 260908 T034 done: PROJ-1's create and edit forms sharing one ProjectFields group, the api's per-field refusal codes mapped onto their fields with the probed status shown, PROJ-7 freezing title+URL with the reason, PROJ-8 delete behind a confirmation that states what survives; one sanitising Markdown in shared/ui and one image upload in shared/upload, which the avatar flow now uses too
- 260908 note: apps/api mail.int.test.ts times out under a full parallel `turbo run test` and passes alone — CI will flake on it; candidate for review-code
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
