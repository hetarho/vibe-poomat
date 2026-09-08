import type {
  CreateUploadUrlInput,
  FileStorage,
  HttpProbe,
  ProbeResult,
  UploadTicket,
  UserSummary,
  UserSummaryReader,
} from '../../shared/application'
import { UrlUnreachableError } from '../../shared/application'
import type { EntityId } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import type { ActiveMissionReader, ActiveMissionSummary } from '../domain/mission.repository'
import type { Project } from '../domain/project'
import type { ProjectRepository } from '../domain/project.repository'

export const FAKE_PUBLIC_BASE = 'https://cdn.test'

export class InMemoryProjectRepository implements ProjectRepository {
  readonly rows = new Map<string, Project>()

  async findById(id: EntityId): Promise<Project | null> {
    return this.rows.get(id.value) ?? null
  }

  async save(project: Project): Promise<void> {
    this.rows.set(project.id.value, project)
  }
}

/** Counts calls, because PROJ-2 is about probing exactly when it should. */
export class StubHttpProbe implements HttpProbe {
  readonly probed: string[] = []
  private reachable = true

  refuseNext(): void {
    this.reachable = false
  }

  async probe(url: string): Promise<Result<ProbeResult, UrlUnreachableError>> {
    this.probed.push(url)
    if (!this.reachable) {
      this.reachable = true

      return err(new UrlUnreachableError('the host answered 503', { status: 503 }))
    }

    return ok({ finalUrl: url, status: 200 })
  }
}

export class StubActiveMissions implements ActiveMissionReader {
  private active: ActiveMissionSummary | null = null

  open(summary?: Partial<ActiveMissionSummary>): void {
    this.active = {
      id: '01920000-0000-7000-8000-0000000000c1',
      slots: 3,
      openSlots: 2,
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
      ...summary,
    }
  }

  close(): void {
    this.active = null
  }

  async activeFor(): Promise<ActiveMissionSummary | null> {
    return this.active
  }

  async activeForMany(projectIds: readonly string[]): Promise<Map<string, ActiveMissionSummary>> {
    const active = this.active
    if (active === null) return new Map()

    return new Map(projectIds.map((projectId) => [projectId, active]))
  }
}

export class StubUserSummaries implements UserSummaryReader {
  private readonly summaries = new Map<string, UserSummary>()

  add(summary: UserSummary): void {
    this.summaries.set(summary.id, summary)
  }

  async summaryFor(userId: string): Promise<UserSummary | null> {
    return this.summaries.get(userId) ?? null
  }

  async summariesFor(userIds: readonly string[]): Promise<Map<string, UserSummary>> {
    const found = new Map<string, UserSummary>()
    for (const userId of userIds) {
      const summary = this.summaries.get(userId)
      if (summary !== undefined) found.set(userId, summary)
    }

    return found
  }
}

export class StubFileStorage implements FileStorage {
  async createUploadUrl(input: CreateUploadUrlInput): Promise<UploadTicket> {
    return {
      url: `${FAKE_PUBLIC_BASE}/${input.key}?signed`,
      publicUrl: this.publicUrl(input.key),
      key: input.key,
      expiresInSeconds: 300,
    }
  }

  async delete(): Promise<void> {
    return undefined
  }

  publicUrl(key: string): string {
    return `${FAKE_PUBLIC_BASE}/${key}`
  }
}

export const passthroughTransactions = {
  run: async <T>(work: () => Promise<T>): Promise<T> => work(),
}
