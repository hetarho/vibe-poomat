# CRED credit ledger
> r2 | The reciprocity engine: how credits are created, escrowed, paid, refunded, voided

## decisions
- CRED-1 [o] unit: whole credits; no fractions, no purchase, no transfer between accounts, no expiry, balance never negative
- CRED-2 [o] seed: 2 credits on account creation, once per account (→AUTH-2) ← first mission gets 2 slots
- CRED-3 [o] mission open: N credits move balance → escrow for that mission (→PROJ-4); balance < N blocks opening
- CRED-4 [o] settle per slot: accept or auto-accept → 1 escrow → feedbacker balance; reject → 1 escrow → maker balance (→FDBK-6, FDBK-7)
- CRED-5 [o] mission close/expire: escrow for unfilled slots → maker balance; held slots stay escrowed until released or settled (→PROJ-6)
- CRED-6 [o] ledger: every movement is an append-only entry with type seed · escrow · payout · refund · void and a reference (mission/feedback); balances are derived, never edited directly
- CRED-7 [o] visibility: balance, credits received, credits given are public on profile; ledger entries visible to owner only
- CRED-8 [o] account deletion: pending feedback on own missions auto-accepted first (payouts happen), then remaining balance and escrow voided (→AUTH-9)
- CRED-9 [o] seed is per account and no email-level rule is needed: providers sharing a verified email link into one account (→AUTH-5), so one person receives one seed
- CRED-10 [x] buying credits, gifting, bonus for "helpful" marks, decay ← v1 keeps 1:1 exchange only

## flow
- lifecycle: seed → balance → escrow(mission) → payout(feedbacker) | refund(maker) | void(deletion)

## constraints
- for every account: balance + escrowed = Σ(seed + payout + refund) − Σ(escrow + void) — always holds
- credits never created except by seed; never destroyed except by void

## chg
- r2 260907 CRED-9✎ [?]→[o] seed stays per account, no per-email rule (follows AUTH-5 linking)
- r1 260906 initial
