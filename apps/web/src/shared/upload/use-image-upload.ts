import type { uploads } from '@repo/contracts'
import { useMutation } from '@tanstack/react-query'
import { apiClient, expectBody } from '../api'
import { checkImage } from './image-policy'

/** A file this side already knows the presign policy would refuse. */
export class ImageNotAllowed extends Error {}

/**
 * ARCH-37: the browser asks the api for a signed URL and then PUTs the bytes
 * straight to storage, so an image never passes through the api at all.
 *
 * One hook for every image the product uploads — the avatar and the project
 * cover differ only in their `purpose`, and two copies of this is how one of
 * them ends up storing the URL instead of the key.
 */
export function useImageUpload(purpose: uploads.UploadPurpose) {
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const checked = checkImage(file)
      if (!checked.allowed) throw new ImageNotAllowed(checked.problem)

      const client = await apiClient()
      const { data } = await client.POST('/api/v1/uploads', {
        body: { purpose, contentType: checked.contentType, sizeBytes: file.size },
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
