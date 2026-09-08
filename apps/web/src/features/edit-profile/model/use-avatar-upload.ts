import type { uploads } from '@repo/contracts'
import { useMutation } from '@tanstack/react-query'
import { apiClient, expectBody } from '../../../shared/api'
import { type ALLOWED_AVATAR_TYPES, avatarProblem } from '../lib/profile-rules'

export class AvatarNotAllowed extends Error {}

/**
 * ARCH-37: the browser asks the api for a signed URL and then PUTs the bytes
 * straight to storage, so an image never passes through the api at all.
 *
 * The type and size are checked here first, against the same policy the api
 * enforces, so somebody learns before a 2MB upload rather than after it.
 */
export function useAvatarUpload() {
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const problem = avatarProblem(file)
      if (problem !== null) throw new AvatarNotAllowed(problem)

      const client = await apiClient()
      const { data } = await client.POST('/api/v1/uploads', {
        body: {
          purpose: 'avatar',
          // narrowed by `avatarProblem` a line above, which is the same list
          contentType: file.type as (typeof ALLOWED_AVATAR_TYPES)[number],
          sizeBytes: file.size,
        },
      })
      const ticket = expectBody<uploads.UploadTicket>(data)

      const put = await fetch(ticket.url, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type },
      })
      if (!put.ok) throw new Error(`the upload was refused with ${put.status}`)

      // the key, never the URL: the api resolves a key to a URL on read, and a
      // caller-chosen URL is exactly what the key exists to prevent
      return ticket.key
    },
  })
}
