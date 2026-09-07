/**
 * Cross-slice *client* state only (ARCH-7). Server state belongs to TanStack
 * Query, and state a single component owns belongs in that component — a store
 * here is for something two unrelated slices both have to see.
 *
 * One slice per file, created with `createStore`, exporting its own selectors.
 * The segment is `model`, not `store`, because FSD names segments by purpose and
 * Steiger enforces that (ARCH-6, ARCH-23).
 */
export { createStore } from './create-store'
