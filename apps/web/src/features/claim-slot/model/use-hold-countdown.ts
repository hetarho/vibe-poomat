import { useEffect, useState } from 'react'
import { formatRemaining, remainingMs } from '../../../entities/feedback'

/** How often the words change at minute granularity without wasting renders. */
const TICK_MS = 30_000

/**
 * The remaining hold, ticking. The value comes from the server's `held_until`;
 * this clock only decides how often to re-read it, so a browser whose time is
 * wrong shows the wrong countdown but never gets a different answer from the
 * server about whether the hold still stands.
 */
export function useHoldCountdown(heldUntil: string): { text: string; lapsed: boolean } {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)

    return () => clearInterval(timer)
  }, [])

  const left = remainingMs(heldUntil, now)

  return { text: formatRemaining(left), lapsed: left === 0 }
}
