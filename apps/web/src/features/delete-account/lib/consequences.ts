/**
 * AUTH-9, copied from the decision rather than paraphrased: the page must not
 * promise something the backend does not do, and every line here is a step the
 * deletion sequence actually runs.
 */
export const DELETION_CONSEQUENCES = [
  'Every mission you have open is force-closed, and the slots nobody took are refunded.',
  'Every report still waiting on your decision is accepted, so the people who wrote them are paid.',
  'Your projects and missions are deleted.',
  'The feedback you gave other people is kept, shown as a deleted user.',
  'Whatever credits you have left, in your balance and in escrow, are voided.',
  'You are signed out everywhere, and this cannot be undone.',
] as const
