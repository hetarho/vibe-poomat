import {
  type CreditSummaryReader,
  DELETE_OBJECT_JOB,
  type FileStorage,
  type JobScheduler,
  type TransactionManager,
} from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import type {
  AvatarNotAllowedError,
  BioNotAllowedError,
  DisplayNameNotAllowedError,
  HandleNotAllowedError,
  HandleTakenError,
  LinkNotAllowedError,
} from '../domain/auth-errors'
import { UserNotFoundError } from '../domain/auth-errors'
import { Avatar } from '../domain/avatar'
import { Bio } from '../domain/bio'
import { ExternalLink } from '../domain/external-link'
import { Handle } from '../domain/handle'
import type { ProfilePatch } from '../domain/user'
import type { UserRepository } from '../domain/user.repository'
import { type PublicProfileView, toPublicProfile } from './profile-view'

/** Absent leaves a field alone; null clears it. */
export type UpdateProfileCommand = {
  userId: string
  displayName?: string
  bio?: string | null
  link?: string | null
  /** The key T014's presign handed the browser, never a URL the caller chose. */
  avatarKey?: string | null
}

export type UpdateProfileError =
  | UserNotFoundError
  | DisplayNameNotAllowedError
  | BioNotAllowedError
  | LinkNotAllowedError
  | AvatarNotAllowedError
  | HandleNotAllowedError
  | HandleTakenError

/**
 * Owner-only profile editing (AUTH-3). Every field is parsed into its value
 * object before anything is written, so a rejected link cannot leave a
 * half-applied display name behind.
 *
 * Replacing an uploaded avatar enqueues the removal of the object it replaced,
 * inside the transaction (ARCH-35), so a rollback leaves no job that would
 * delete a picture still in use. A provider URL is not ours to delete.
 */
export class UpdateProfileUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly storage: FileStorage,
    private readonly credits: CreditSummaryReader,
    private readonly jobs: JobScheduler,
    private readonly transactions: TransactionManager,
  ) {}

  async execute(
    command: UpdateProfileCommand,
  ): Promise<Result<PublicProfileView, UpdateProfileError>> {
    return this.transactions.run(async () => {
      const id = EntityId.parse(command.userId)
      if (id.isErr()) return err(new UserNotFoundError('no such account'))

      const user = await this.users.findById(id.value)
      if (user === null) return err(new UserNotFoundError('no such account'))

      const patch = this.parse(command)
      if (patch.isErr()) return err(patch.error)

      const replaced = user.avatar?.storageKey ?? null
      const applied = user.updateProfile(patch.value)
      if (applied.isErr()) return err(applied.error)

      const saved = await this.users.save(user)
      if (saved.isErr()) return err(saved.error)

      const kept = user.avatar?.storageKey ?? null
      if (replaced !== null && replaced !== kept) {
        await this.jobs.enqueue(DELETE_OBJECT_JOB, { key: replaced })
      }

      return ok(toPublicProfile(user, this.storage, await this.credits.summaryFor(user.id.value)))
    })
  }

  private parse(command: UpdateProfileCommand): Result<ProfilePatch, UpdateProfileError> {
    const patch: ProfilePatch = {}

    if (command.displayName !== undefined) patch.displayName = command.displayName

    if (command.bio !== undefined) {
      if (command.bio === null) {
        patch.bio = null
      } else {
        const bio = Bio.create(command.bio)
        if (bio.isErr()) return err(bio.error)
        patch.bio = bio.value
      }
    }

    if (command.link !== undefined) {
      if (command.link === null) {
        patch.link = null
      } else {
        const link = ExternalLink.create(command.link)
        if (link.isErr()) return err(link.error)
        patch.link = link.value
      }
    }

    if (command.avatarKey !== undefined) {
      if (command.avatarKey === null) {
        patch.avatar = null
      } else {
        const avatar = Avatar.fromStorageKey(command.avatarKey)
        if (avatar.isErr()) return err(avatar.error)
        patch.avatar = avatar.value
      }
    }

    return ok(patch)
  }
}

/**
 * A handle change is its own use case because it is its own decision: AUTH-6
 * frees the old one immediately and redirects nothing, and the only failure it
 * can have is a collision the database settles.
 */
export class ChangeHandleUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly storage: FileStorage,
    private readonly credits: CreditSummaryReader,
    private readonly transactions: TransactionManager,
  ) {}

  async execute(input: {
    userId: string
    handle: string
  }): Promise<Result<PublicProfileView, UpdateProfileError>> {
    return this.transactions.run(async () => {
      const id = EntityId.parse(input.userId)
      if (id.isErr()) return err(new UserNotFoundError('no such account'))

      const handle = Handle.create(input.handle)
      if (handle.isErr()) return err(handle.error)

      const user = await this.users.findById(id.value)
      if (user === null) return err(new UserNotFoundError('no such account'))

      user.changeHandle(handle.value)

      const saved = await this.users.save(user)
      if (saved.isErr()) return err(saved.error)

      return ok(toPublicProfile(user, this.storage, await this.credits.summaryFor(user.id.value)))
    })
  }
}
