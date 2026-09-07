import { describe, expect, it, vi } from 'vitest'
import type { JobHandler } from '../../application'
import { DUPLICATE_JOB_HANDLER, JobRegistry, UNKNOWN_JOB_NAME } from './job-registry'

function handler(jobName: string): JobHandler {
  return { jobName, handle: vi.fn(async () => undefined) }
}

describe('JobRegistry', () => {
  it('keeps one handler per job name', () => {
    const registry = new JobRegistry()
    registry.register(handler('slot.release'))
    registry.register(handler('email.send'))

    expect([...registry.names()].sort()).toEqual(['email.send', 'slot.release'])
    expect(registry.has('slot.release')).toBe(true)
  })

  it('refuses a second handler for the same name', () => {
    const registry = new JobRegistry()
    registry.register(handler('slot.release'))

    expect(() => registry.register(handler('slot.release'))).toThrow(DUPLICATE_JOB_HANDLER)
  })

  it('fails loudly for a name nobody handles', () => {
    expect(() => new JobRegistry().require('mission.expire')).toThrow(UNKNOWN_JOB_NAME)
    expect(new JobRegistry().has('mission.expire')).toBe(false)
  })
})
