import { type ApiErrorBody, errorSchema } from '@repo/contracts'

/** Code used when the api answered with something that is not an error body at all. */
export const INTERNAL_ERROR_CODE = 'INTERNAL'

/**
 * Every non-2xx answer reaches the caller as one of these, so a feature never
 * has to branch on `response.status` or reach into an untyped body.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    if (body.details !== undefined) this.details = body.details
  }
}

export async function apiErrorFrom(response: Response): Promise<ApiError> {
  let body: unknown
  try {
    body = await response.clone().json()
  } catch {
    // a proxy timeout or a crash answers with HTML, or with nothing at all
    body = undefined
  }

  const parsed = errorSchema.safeParse(body)
  if (parsed.success) return new ApiError(response.status, parsed.data)

  return new ApiError(response.status, {
    code: INTERNAL_ERROR_CODE,
    message: response.statusText.length > 0 ? response.statusText : 'request failed',
  })
}
