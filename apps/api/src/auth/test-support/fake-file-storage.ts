import type { CreateUploadUrlInput, FileStorage, UploadTicket } from '../../shared/application'

export const FAKE_PUBLIC_BASE = 'https://cdn.test'

/**
 * Enough of ARCH-37's port for a profile test: what matters here is only that a
 * stored key resolves to a URL, and which keys were asked to be deleted.
 */
export class FakeFileStorage implements FileStorage {
  readonly deleted: string[] = []

  async createUploadUrl(input: CreateUploadUrlInput): Promise<UploadTicket> {
    return {
      url: `${FAKE_PUBLIC_BASE}/${input.key}?signed`,
      publicUrl: this.publicUrl(input.key),
      key: input.key,
      expiresInSeconds: 300,
    }
  }

  async delete(key: string): Promise<void> {
    this.deleted.push(key)
  }

  publicUrl(key: string): string {
    return `${FAKE_PUBLIC_BASE}/${key}`
  }
}
