# FDBK feedback
> r2 | How a feedbacker claims a slot, what they submit, how the maker settles it

## decisions
- FDBK-1 [o] claim: feedbacker presses Start on an open slot → slot held for 24h; no submission → slot released automatically; no re-claim limit in v1 ← avoids several people racing one slot
- FDBK-2 [o] eligibility: signed in, not the project owner, at most one submission per mission per account
- FDBK-3 [o] report fields, all required: first impression · where I got stuck · would I pay (yes/no + why) · one suggestion · answers to each mission question ← baseline quality + maker focus
- FDBK-4 [o] report immutable after submit ← the maker judges a fixed artifact
- FDBK-5 [o] thread per feedback: only maker and feedbacker can reply; everyone can read
- FDBK-6 [o] settle by maker: accept → 1 credit to feedbacker (→CRED-4) | reject → fixed reason (task not done · no substance · spam/abuse) + optional note, visible to feedbacker, credit back to maker (→CRED-4)
- FDBK-7 [o] no maker response within 72h of submission → auto-accepted; warning to maker at 48h (→NOTI-2)
- FDBK-8 [o] maker profile shows rejection rate and reason distribution ← only check on maker power in v1
- FDBK-9 [o] submitted feedback (report + thread) is public; author shown as "deleted user" if the account is deleted (→AUTH-9)
- FDBK-10 [o] every required report field and every mission-question answer needs ≥20 characters; submit is rejected with a per-field message
- FDBK-11 [x] appeal/dispute of rejection ← v2; rejection rate is the v1 check
- FDBK-12 [x] editing after submit, private feedback, star ratings, screen recording upload ← v1 scope

## flow
- feedback: open slot → Start(held 24h) → use project, do task → submit report(+answers) → pending → maker accept | reject(reason) | 72h → auto-accept
- thread: any time after submit, maker ↔ feedbacker replies

## constraints
- one account ↔ one mission: at most one held or submitted slot
- a rejected feedback stays public with its rejection reason

## chg
- r2 260907 FDBK-10✎ [?]→[o] min 20 chars per required field and per answer
- r1 260906 initial
