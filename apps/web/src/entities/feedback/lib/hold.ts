import type { feedback } from '@repo/contracts'

/** FDBK-1: a hold lasts a day, and the server is what decides when it lapsed. */
export function remainingMs(heldUntil: string, now: number): number {
  return Math.max(0, new Date(heldUntil).getTime() - now)
}

/**
 * A lapsed hold, as far as this browser can tell. The server is still the
 * authority — the release job has its own clock, and a submit against a hold it
 * considers over comes back as `CLAIM_EXPIRED` — so this only decides what to
 * render, never what to allow.
 */
export function isLapsed(heldUntil: string, now: number): boolean {
  return remainingMs(heldUntil, now) === 0
}

/** Minutes, because an hour-and-a-bit is what somebody needs to know. */
export function formatRemaining(ms: number): string {
  if (ms === 0) return 'no time left'

  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'less than a minute left'
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  return rest === 0 ? `${hours} ${hours === 1 ? 'hour' : 'hours'} left` : `${hours}h ${rest}m left`
}

/** Whether this claim still occupies its slot, whatever the clock says (FDBK-1). */
export function occupiesSlot(claim: feedback.Claim): boolean {
  return claim.state !== 'released'
}
