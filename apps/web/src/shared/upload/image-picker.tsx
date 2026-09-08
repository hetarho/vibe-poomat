import type { uploads } from '@repo/contracts'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../api'
import { ALLOWED_IMAGE_TYPES } from './image-policy'
import { ImageNotAllowed, useImageUpload } from './use-image-upload'

export type PickedImage = {
  /** What the api will be told about; the URL is never the caller's to choose. */
  key: string
  /** A local URL for showing the file before it exists anywhere public. */
  previewUrl: string
}

type ImagePickerProps = {
  id: string
  label: string
  purpose: uploads.UploadPurpose
  /** How this image looks in place — an avatar circle, a cover banner. */
  preview?: ReactNode
  hint?: string
  /** The stored key once the bytes have landed, and null when a pick failed. */
  onPicked: (picked: PickedImage | null) => void
}

/**
 * One control for every image somebody uploads. It owns the whole pick: the
 * policy refusal, the presigned PUT, the pending line, and the object URL —
 * which is revoked when the next pick replaces it or the control goes away,
 * never while the preview it feeds is still on screen.
 */
export function ImagePicker({ id, label, purpose, preview, hint, onPicked }: ImagePickerProps) {
  const [problem, setProblem] = useState<string | null>(null)
  const upload = useImageUpload(purpose)
  const objectUrl = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current)
    },
    [],
  )

  async function choose(file: File | undefined): Promise<void> {
    if (file === undefined) return

    setProblem(null)
    if (objectUrl.current !== null) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = URL.createObjectURL(file)

    try {
      onPicked({ key: await upload.mutateAsync(file), previewUrl: objectUrl.current })
    } catch (error) {
      // the preview goes back with the key: a picture of a file that was never
      // stored is worse than no picture at all
      URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = null
      onPicked(null)
      setProblem(error instanceof ImageNotAllowed ? error.message : errorMessage(error))
    }
  }

  return (
    <div className="flex items-center gap-4">
      {preview}
      <div className="flex flex-col gap-1">
        <label className="font-medium text-sm" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          className="text-sm"
          onChange={(event) => void choose(event.target.files?.[0])}
        />
        {hint === undefined ? null : <p className="text-muted-foreground text-xs">{hint}</p>}
        {problem === null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}
        {upload.isPending ? <p className="text-muted-foreground text-sm">Uploading…</p> : null}
      </div>
    </div>
  )
}
