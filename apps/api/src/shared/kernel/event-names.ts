/**
 * Names of the domain events that cross a context boundary. They live in the
 * kernel because both ends need them and neither may import the other: a
 * subscriber in one context would otherwise have to reach into the aggregate of
 * another just to learn a string (ARCH-10).
 *
 * An event nobody outside its own context listens to keeps its name at home.
 */
export const CROSS_CONTEXT_EVENTS = {
  /** Signup happened (AUTH-2). The aggregate id is the account id. */
  accountCreated: 'auth.account-created',
  /** A mission stopped taking feedback (PROJ-6). The aggregate id is the mission. */
  missionEnded: 'project.mission-ended',
  /** Somebody took a slot (FDBK-1). The aggregate id is the claim. */
  claimHeld: 'feedback.claim-held',
  /** A slot went back, by hand or because the day ran out (FDBK-1). */
  claimReleased: 'feedback.claim-released',
  /** A report landed and is waiting on the maker (FDBK-3). */
  feedbackSubmitted: 'feedback.submitted',
  /** The maker has not answered in 48 hours and has 24 left (FDBK-7). */
  autoAcceptWarning: 'feedback.auto-accept-warning',
  /** One side of a thread said something to the other (FDBK-5). */
  threadReplied: 'feedback.thread-replied',
  /** One slot's credit moved (CRED-4). The aggregate id is the feedback. */
  slotSettled: 'feedback.slot-settled',
} as const

/**
 * What a subscriber to `slotSettled` may rely on, whatever else the emitting
 * aggregate carries. Declared here for the same reason the names are: the
 * mission that has to notice its last slot settling lives in another context
 * from the feedback that settled it.
 */
export type SlotSettledPayload = { readonly missionId: string }

export function carriesMissionId<TEvent extends object>(
  event: TEvent,
): event is TEvent & SlotSettledPayload {
  return 'missionId' in event && typeof (event as { missionId: unknown }).missionId === 'string'
}
