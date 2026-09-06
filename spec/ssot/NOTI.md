# NOTI notifications
> r2 | Emails that keep the feedback loop moving

## decisions
- NOTI-1 [o] channel: email only, sent to provider email (→AUTH-4); immediate per event, no batching
- NOTI-2 [o] events: feedback received (maker) · thread reply (the other party) · feedback accepted / rejected with reason (feedbacker) · auto-accept warning at 48h (maker) · auto-accepted (maker + feedbacker) · mission completed / expired with refund summary (maker)
- NOTI-3 [o] opt-out per event type in settings; auto-accept warning cannot be disabled ← it moves credits
- NOTI-4 [o] every email deep-links to the item and carries a per-type unsubscribe link
- NOTI-5 [o] sender: one no-reply address configured per environment, display name = product name; inbound replies are not accepted and the body says so
- NOTI-6 [x] batching when many feedbacks land in a short window ← immediate per event stays (→NOTI-1)
- NOTI-7 [x] in-app inbox / bell, push, weekly digest, marketing emails ← v1 scope

## flow
- settle chain: submit → email maker(feedback received) → 48h → email maker(warning) → 72h → auto-accept → email both

## chg
- r2 260907 NOTI-5✎ [?]→[o] env-configured no-reply sender; NOTI-6✎ [?]→[x] no batching
- r1 260906 initial
