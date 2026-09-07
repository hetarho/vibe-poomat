import type { FileStorage, UploadTicket } from '../../shared/application'
import { err, ok, type Result } from '../../shared/result'
import { planUpload, type UploadNotAllowedError } from './upload-policy'

export type CreateUploadUrlCommand = {
  purpose: string
  contentType: string
  sizeBytes: number
}

/**
 * A plain class with no framework import at all (ARCH-11): the module wires it
 * with a factory, so the port stays an interface plus a Symbol token and this
 * file can be tested with a hand-written fake.
 *
 * Decides whether an upload is allowed and what it will be called, then asks
 * storage for a URL the browser can PUT to. The bytes never come here (ARCH-37).
 */
export class CreateUploadUrlUseCase {
  constructor(private readonly storage: FileStorage) {}

  async execute(
    command: CreateUploadUrlCommand,
  ): Promise<Result<UploadTicket, UploadNotAllowedError>> {
    const plan = planUpload({
      purpose: command.purpose,
      contentType: command.contentType,
      declaredBytes: command.sizeBytes,
    })
    if (plan.isErr()) return err(plan.error)

    return ok(await this.storage.createUploadUrl(plan.value))
  }
}
