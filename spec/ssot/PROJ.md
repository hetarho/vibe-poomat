# PROJ projects, missions, feed
> r2 | What a maker posts, how a mission requests feedback, how the feed orders it

## decisions
- PROJ-1 [o] project fields: title (≤60), live URL (required, https, publicly reachable), pitch (≤200), description (opt, markdown), tags (≤3 from PROJ-3), cover image (opt)
- PROJ-2 [o] live URL must open in a browser without install; verified reachable at creation; unreachable → creation blocked with message ← "first user" must actually use it
- PROJ-3 [o] tags: fixed list SaaS · Tool · Game · AI · Social · Productivity · Other; max 3 ← filterable, no fragmentation
- PROJ-4 [o] mission: task text (what to try), up to 3 maker questions, N slots; opening escrows N credits (→CRED-3); insufficient credits → cannot open
- PROJ-5 [o] one active mission per project ← concentrates scarce feedback supply
- PROJ-6 [o] mission lifecycle: open → completed (all slots settled) | closed (maker, any time) | expired (30 days after open); on close/expire unfilled slots refunded (→CRED-5), held slots wait until released or submitted (→FDBK-1)
- PROJ-7 [o] while a mission is active: URL and mission text/questions immutable; pitch, description, tags, cover editable ← feedback must match what feedbackers saw
- PROJ-8 [o] project deletion blocked while a mission is active; after: project hidden from public, received feedback archived visible to maker only, feedbackers keep their "feedback given" entries
- PROJ-9 [o] default feed: projects with open slots first (newest mission first), then the rest newest first; filter by tag
- PROJ-10 [o] popular tab: ordered by upvotes in last 7 days, ties by total ← keeps showcase out of the feedback feed
- PROJ-11 [o] upvote: one per account per project, not on own project, toggleable
- PROJ-12 [o] every project public on creation; no draft state; single owner account
- PROJ-13 [o] mission caps: slots 1-10 per mission · task text ≤1000 chars · each maker question ≤200 chars
- PROJ-14 [x] abuse reporting on projects ← no moderation tooling or role exists in v1 (→AUTH-7)
- PROJ-15 [x] mobile app / CLI / install-required projects ← v1 web URL only
- PROJ-16 [x] screenshot- or video-only submissions ← nothing to use
- PROJ-17 [x] drafts, multiple active missions, collaborators, project categories beyond tags ← v1 scope

## flow
- post: create project(URL check) → public in feed → open mission(task, ≤3 questions, N slots) → escrow N → mission open
- mission end: all slots settled → completed | maker closes → refund unfilled | 30d → expired → refund unfilled

## constraints
- mission text/questions/URL frozen for the life of the mission
- a project never has two missions in state open

## chg
- r2 260907 PROJ-13✎ [?]→[o] slots 1-10, task ≤1000, question ≤200; PROJ-14✎ [?]→[x] no abuse reporting in v1
- r1 260906 initial
