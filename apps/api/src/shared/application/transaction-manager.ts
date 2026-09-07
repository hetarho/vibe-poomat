export const TRANSACTION_MANAGER = Symbol('TRANSACTION_MANAGER')

/**
 * One database transaction per use case (ARCH-38). Repositories join the
 * ambient transaction on their own, so no port signature has to carry it and
 * `application` stays framework-free (ARCH-11).
 */
export type TransactionManager = {
  run<T>(work: () => Promise<T>): Promise<T>
}
