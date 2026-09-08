import { ConflictError, ValidationError } from '../../shared/result'

/**
 * CRED-3: a balance that cannot cover the escrow blocks the mission from
 * opening. The database check constraint is the backstop; this is the answer the
 * caller gets.
 */
export class InsufficientCreditsError extends ConflictError {
  override readonly code = 'CREDIT_INSUFFICIENT'
}

/** Credits are whole and positive (CRED-1); anything else is a caller's bug. */
export class InvalidCreditAmountError extends ValidationError {
  override readonly code = 'CREDIT_INVALID_AMOUNT'
}
