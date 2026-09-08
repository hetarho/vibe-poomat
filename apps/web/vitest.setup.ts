import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom implements no scrolling, and the router's scroll restoration calls this
window.scrollTo = () => undefined

/**
 * jsdom implements `localStorage`, but this environment does not expose it as a
 * global, and node's own is unavailable without a flag. The web code treats
 * storage as a convenience that may be missing — every access is wrapped — so an
 * in-memory stand-in is enough to test the behaviour that depends on it.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const entries = new Map<string, string>()

  const storage: Storage = {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => {
      entries.delete(key)
    },
    setItem: (key, value) => {
      entries.set(key, String(value))
    },
  }

  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
}

afterEach(() => {
  cleanup()
})
