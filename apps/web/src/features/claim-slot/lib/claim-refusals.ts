import { ApiError } from '../../../shared/api'

/**
 * Every way pressing Start can be refused, each said in its own words. A single
 * "that did not work" would leave somebody guessing between four different
 * situations, three of which they can do something about.
 */
const MESSAGE_BY_CODE: Readonly<Record<string, string>> = {
  NO_SLOTS_AVAILABLE:
    'Every slot on this mission is taken. Slots come back when a hold runs out, so it is worth looking again later.',
  ALREADY_CLAIMED: 'You already have a slot on this mission — one each.',
  MISSION_NOT_OPEN: 'This mission has ended, so it is not taking feedback any more.',
  OWN_PROJECT: 'This is your own project. Somebody else has to be the first user.',
  CLAIM_EXPIRED: 'That hold ran out, and the slot went back. Take another one if any are left.',
}

export const FALLBACK_REFUSAL = 'That slot could not be taken. Try again in a moment.'

export function claimRefusal(error: unknown): string {
  if (!(error instanceof ApiError)) return FALLBACK_REFUSAL

  return MESSAGE_BY_CODE[error.code] ?? FALLBACK_REFUSAL
}

export function isKnownRefusal(code: string): boolean {
  return code in MESSAGE_BY_CODE
}
