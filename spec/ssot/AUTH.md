# AUTH account & identity
> r2 | Who can join, how they sign in, what a profile is, what happens on deletion

## decisions
- AUTH-1 [o] sign-in: GitHub OAuth, Google OAuth only ← covers no-code vibe-coders; no email/password suppresses multi-account seed farming
- AUTH-2 [o] signup = first successful sign-in; creates account + public profile; emits account-created → seed credits (→CRED-2)
- AUTH-3 [o] profile: display name, avatar (prefilled from provider, editable), bio (opt, ≤160), one external link (opt); public
- AUTH-4 [o] provider email never shown publicly; used only for notifications (→NOTI-1)
- AUTH-5 [o] provider linking: a sign-in whose verified provider email matches an existing account attaches as an extra identity on that account instead of creating one; an unverified provider email never links and creates a separate account ← one person gets one seed grant (→CRED-2)
- AUTH-6 [o] public profile URL `/@handle`: unique, 3-20 chars of [a-z0-9_], derived from the provider username at signup with a numeric suffix on collision, editable in settings; the freed handle is immediately claimable and old links are not redirected
- AUTH-7 [o] one role: every account is both maker and feedbacker; no admin role or UI in v1 ← moderation is manual
- AUTH-8 [o] session lifetime: stays signed in until logout or 30 days idle
- AUTH-9 [o] account deletion (self-serve, immediate): active missions force-closed first (→PROJ-6, →CRED-5); pending feedback on own missions auto-accepted so feedbackers get paid (→CRED-4); own projects/missions deleted; feedback given kept, author shown as "deleted user"; balance and escrow voided (→CRED-8) ← preserve value received by others, kill the account
- AUTH-10 [x] email/password, magic link ← seed farming
- AUTH-11 [x] manual provider-linking and account-merge UI ← linking happens automatically at sign-in (→AUTH-5)
- AUTH-12 [x] roles, teams, admin console ← v1 scope

## flow
- sign-in: click provider → consent → callback(known identity: load | verified email matches an account: attach identity → load | else: create account+profile+handle → seed credits) → return to origin page
- delete: settings → confirm → force-close missions → auto-accept pending feedback → anonymize feedback given → void credits → delete account → signed out

## constraints
- store only provider id, email, name, avatar URL; no other PII
- handle is unique across accounts and case-insensitive
- deletion is irreversible; no grace period in v1

## chg
- r2 260907 AUTH-5✎ [?]→[o] link identities on matching verified email; AUTH-6✎ [?]→[o] `/@handle`; AUTH-11✎ v2-conditional→[x] no manual link/merge UI
- r1 260906 initial
