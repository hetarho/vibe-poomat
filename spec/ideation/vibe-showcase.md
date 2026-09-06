# IDEATION vibe-showcase
> st:converted@260906 | A place where vibe-coders show off what they built and act as each other's first users, giving feedback

## vision
- problem: solo vibe-coders ship things nobody uses; no first users, no honest feedback
- target: entry point = vibe-coders (AI-tool builders); actually open to any indie builder
- core value: reciprocal feedback — "try mine, I'll try yours"; showcase is the acquisition hook, not the engine

## explored
- [o] core = reciprocal feedback, not showcase ← showcase-first (Product Hunt) collapses feedback into "congrats"; roast-first attracts no posters
- [o] reciprocity = credit economy: 1 accepted feedback = 1 credit; credits buy feedback requests on own project ← self-balancing, fair; risk: low-quality feedback farming → needs quality rating
- [o] feedback = mission-based: maker posts tasks "try X and tell me" + free comment threads ← forces real usage; maker steers what gets validated
- [x] showcase/gallery as core ← feedback quality collapses (PH pattern)
- [x] first-user acquisition (traffic) as core ← two-sided market, needs non-builder users
- [x] hard prerequisite (review N before posting) ← cold start: first posters have nothing to review
- [x] karma-only, no enforcement ← free-riding kills feedback supply in every community that tried it
- [x] vibe-coder as hard identity (AI-only) ← market too small; keep as marketing angle only
- [o] credit granted only when maker accepts the feedback ← quality over volume; risk: stingy makers starve feedbackers → needs safeguard (see open)
- [x] auto +1 on submit ← credit farming with low-effort feedback
- [x] hybrid auto+bonus ← chosen strictness over supply
- [o] cold start = seed credits on signup, then organic ← zero ops; accept seed-and-leave churn
- [x] launch cohort ← ops cost; revisit if organic stalls
- [x] credit gate off at launch ← turning it on later causes churn
- [o] project requires live usable URL; screenshots/video-only rejected ← "first user" must actually use it
- [o] v1 includes: public feed/explore, upvotes, user profile (projects · feedback given · credit history), notifications (email: feedback received, reply)
- [x] v1 excludes: DM/chat, teams/orgs, paid credits, comments-only projects without URL
- [o] safeguard: maker escrows credits when opening slots; feedback auto-accepted after 72h silence; rejection requires reason; rejection rate shown on profile; rejected credit returns to maker ← protects feedbackers without removing maker judgment
- [o] pricing: opening a mission with N slots costs N credits; 1 accepted feedback = 1 credit ← 1:1 exchange, easy to reason about
- [x] time-tier pricing ← makers under-report time
- [x] per-project posting fee ← popular projects monopolize supply
- [o] default feed = open slots first / newest; upvotes live in a separate "popular" tab ← feedback engine stays primary, showcase isolated
- [o] v1 project types = directly openable web URL only ← zero install friction; mobile/CLI later
- [o] feedback report = fixed 4-field template (first impression / where stuck / would pay? Y/N+why / one suggestion) + up to 3 maker-defined questions per mission ← baseline quality + maker focus
- [o] seed = 2 credits on signup; max 1 active mission per project ← first mission gets 2 slots; concentrates scarce supply
- [o] signup = GitHub + Google social login only, no email/password ← covers no-code vibe-coders; suppresses multi-account seed farming
- [x] GitHub-only ← excludes no-code/designer builders
- [x] email+password ← multi-account seed farming
- [o] v1 has no dispute channel for rejected feedback; public rejection rate is the only check ← keep v1 small; arbitration is v2
- [x] auto-arbitration (rejection-rate threshold blocks missions) ← premature rule tuning without data

## shape
- flow post: signup(seed credits) → create project(live URL, pitch) → create mission(task text, N slots → escrow N credits) → project appears in feed
- flow feedback: browse feed → pick mission → open URL, do the task → submit feedback(report + thread) → slot taken
- flow settle: maker accepts(+1 credit to feedbacker) | rejects with reason(credit back to maker, rejection rate ↑) | 72h silence → auto-accept
- flow loop: feedbacker now has credits → opens own mission → cycle
- v1: web-URL projects, missions(task + ≤3 questions, N slots, 1 active per project), credit ledger(seed 2·escrow·settle·refund), feedback report(4 fixed fields + answers)+thread, feed(open slots/newest) + popular tab(upvotes), profile(projects·feedback given·credits·rejection rate), email notifications(feedback received, reply, settled/rejected, auto-accept warning), social login(GitHub·Google)
- not: DM/chat, teams, paid credits, mobile/CLI projects, video-only submissions, admin arbitration UI

## domains
- AUTH: social login GitHub+Google only, account = one identity per provider, profile identity, triggers seed credits →AUTH
- PROJ: project(live URL, pitch, tags), mission(task, slots), feed sorting, popular tab, upvote →PROJ
- FDBK: feedback report(4 fixed fields + ≤3 mission answers) + thread, one submission per slot, accept/reject(reason)/auto-accept 72h →FDBK
- CRED: credit ledger — seed, escrow on mission open, settle on accept/auto-accept, refund on reject, rejection rate →CRED
- NOTI: email notifications — feedback received, reply, settled/rejected, 72h auto-accept warning →NOTI

## open
- [?] ARCH-18 assumes password auth (argon2id); social-only login needs ARCH revision (OAuth flow, no credentials table) — for create-architecture, not decided here
- [?] tags/categories for projects: free tags vs fixed list — decide in PROJ SSOT
- [?] what happens to escrowed credits if a mission is closed with unfilled slots — refund assumed, confirm in CRED SSOT
