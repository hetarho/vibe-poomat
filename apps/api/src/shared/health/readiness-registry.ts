import { Injectable } from '@nestjs/common'

export type ReadinessIndicator = {
  readonly name: string
  check(): Promise<boolean>
}

export type ReadinessReport = {
  readonly ready: boolean
  readonly checks: Readonly<Record<string, boolean>>
}

/**
 * Modules register their own indicator in `onModuleInit`, so adding a dependency
 * to the readiness probe never means editing the health controller.
 */
@Injectable()
export class ReadinessRegistry {
  private readonly indicators = new Map<string, ReadinessIndicator>()

  register(indicator: ReadinessIndicator): void {
    this.indicators.set(indicator.name, indicator)
  }

  async report(): Promise<ReadinessReport> {
    const results = await Promise.all(
      [...this.indicators.values()].map(async (indicator) => {
        try {
          return [indicator.name, await indicator.check()] as const
        } catch {
          // an indicator that throws is a failing indicator, never a failing probe
          return [indicator.name, false] as const
        }
      }),
    )

    return {
      ready: results.every(([, passed]) => passed),
      checks: Object.fromEntries(results),
    }
  }
}
