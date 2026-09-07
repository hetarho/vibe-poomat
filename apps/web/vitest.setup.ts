import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom implements no scrolling, and the router's scroll restoration calls this
window.scrollTo = () => undefined

afterEach(() => {
  cleanup()
})
