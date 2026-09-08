import { Inject, Injectable } from '@nestjs/common'
import {
  FILE_STORAGE,
  type FileStorage,
  type UserSummary,
  type UserSummaryReader,
} from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import type { User } from '../domain/user'
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository'

/**
 * What other contexts are allowed to know about an account. The avatar is
 * resolved here, so a caller never has to learn that a stored value might be a
 * storage key rather than a URL.
 */
@Injectable()
export class UserSummaryAdapter implements UserSummaryReader {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async summaryFor(userId: string): Promise<UserSummary | null> {
    const id = EntityId.parse(userId)
    if (id.isErr()) return null

    const user = await this.users.findById(id.value)

    return user === null ? null : this.toSummary(user)
  }

  async summariesFor(userIds: readonly string[]): Promise<Map<string, UserSummary>> {
    const summaries = new Map<string, UserSummary>()
    for (const userId of new Set(userIds)) {
      const summary = await this.summaryFor(userId)
      if (summary !== null) summaries.set(userId, summary)
    }

    return summaries
  }

  private toSummary(user: User): UserSummary {
    const avatar = user.avatar

    return {
      id: user.id.value,
      handle: user.handle.value,
      displayName: user.displayName,
      avatarUrl:
        avatar === null
          ? null
          : avatar.isStorageKey
            ? this.storage.publicUrl(avatar.value)
            : avatar.value,
    }
  }
}
