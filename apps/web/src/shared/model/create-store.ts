import type { StateCreator } from 'zustand'
import { create } from 'zustand'

/**
 * Typed wrapper so every slice is declared the same way. Selectors are exported
 * next to their slice rather than read inline, which keeps re-renders narrow.
 */
export function createStore<TState>(initializer: StateCreator<TState>) {
  return create<TState>()(initializer)
}
