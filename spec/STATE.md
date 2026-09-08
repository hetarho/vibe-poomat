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
| - | - | - | - | - |

## next
- every task is done. review-code is the next step: T034-T040 left three standing findings — the dev server never hydrates (react-dom/server in the client graph), nothing outside the deploy stack proxies /api to the api, and six api read models were added ad hoc from web tasks
- update-ssot candidates: AUTH-9 calls a deleted account's projects "deleted" when they are hidden (T031); PROJ-7 is silent on whether the title is frozen with the URL (T034); NOTI-4 is silent on which side holds the unsubscribe token (T039)
- before the first deploy: set the repository variables and secrets listed in the .github/workflows/deploy.yml header, including the four OAuth ones and NOTIFICATION_SECRET

## log
- 260909 T040 done: the five reciprocity flows in chromium against the built artifact, api and db started by globalSetup, in ~7s; the AUTH-1 bypass lives in the auth context and is absent from a production graph, and NODE_ENV=test binds a probe that answers for reserved .test hosts because ARCH-40 refuses loopback
- 260909 note: T040 found that the dev server never hydrates (its client graph imports react-dom/server and throws) and that nothing outside the deploy stack proxies /api to the api — both need their own task
- 260909 T040 claimed (wb)
- 260909 T039 done: NOTI-2's seven toggles optimistic with rollback and the NOTI-3 row always-on with its reason, NOTI-4's /unsubscribe landing page needing no session, a NOTI-7 guard on the shell; the api's unsubscribe now redirects on failure too, so a tampered token is a page rather than a 422 body, carrying the code and never the account
- 260909 note: T039 acceptance 3 diverges — the api holds the token and redirects to /unsubscribe (T030's design) rather than the page calling the endpoint; NOTI-4 does not decide which side, so this is a decomposition conflict to confirm
- 260909 T039 claimed (wb)
- 260909 T038 done: FDBK-9's public report with FDBK-7's deadline and an auto-accept label distinct from a manual one, FDBK-6 accept/reject stating CRED-4's movement before confirming, FDBK-5's thread optimistic for the two participants and read-only for everyone else, a pending-first maker inbox; the api gained GET /feedbacks/received and makerId on the report
- 260908 T038 claimed (wb)
- 260908 T037 done: FDBK-1's Start with each refusal code in its own words, a 24h countdown from the server's held_until with a lapsed state, FDBK-3's fixed report behind FDBK-10's 20-char floor beside the frozen task, a per-claim localStorage draft cleared on submit, FDBK-4's read-only view after; the api gained GET /missions/:id and GET /missions/:id/claims/me
- 260908 note: five api read gaps have now been filled from web tasks (project feedback, upvotedByViewer, mission list, mission by id, my claim) — the read models the web needs were never tasked; worth a create-task or update-ssot pass before T038
- 260908 T037 claimed (wb)
- 260908 T036 done: PROJ-13's open-mission form with CRED-3's cost against a live balance, one MissionPanel showing PROJ-6 state and the FDBK-1 slot breakdown plus PROJ-7's frozen task, PROJ-6 close behind a confirmation stating both halves of CRED-5; the api gained GET /projects/:id/missions (no mission was readable at all) and an occupancy breakdown on the response
- 260908 note: an ended mission's refund summary is derived from the current occupancy because refundedSlots lives only on the MissionEnded event — check whether releasing a held slot after the mission ended refunds it (review-code)
- 260908 T036 claimed (wb)
- 260908 T035 done: PROJ-9/PROJ-10 as two tabs over one card and one paging widget, PROJ-3's filter in the URL and honoured by the SSR loader, optimistic PROJ-11 upvoting patched into every cached feed and the project, PROJ-8's archived banner; the api gained GET /projects/:id/feedbacks (its public feedback was unreachable once a mission ended) and upvotedByViewer on the project read
- 260908 note: web feed loaders prefetch rather than ensure — an ensure rethrows and would blank the public landing page when the api blips; the same applies to any public route added later
- 260908 T035 claimed (wb)
- 260908 T034 done: PROJ-1's create and edit forms sharing one ProjectFields group, the api's per-field refusal codes mapped onto their fields with the probed status shown, PROJ-7 freezing title+URL with the reason, PROJ-8 delete behind a confirmation that states what survives; one sanitising Markdown in shared/ui and one image upload in shared/upload, which the avatar flow now uses too
- 260908 note: apps/api mail.int.test.ts times out under a full parallel `turbo run test` and passes alone — CI will flake on it; candidate for review-code
- 260908 T033 done: /@handle profile with CRED-7 counters and FDBK-8 stats, settings with avatar presign, handle change, notification toggles and AUTH-9 deletion; the feed gained ?owner= and GET /users/:authorId/feedbacks was added, because the profile lists had no endpoint at all
