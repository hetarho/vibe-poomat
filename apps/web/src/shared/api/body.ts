/**
 * The generated client types every response body as `undefined`, because the api
 * declares no response schemas — Nest cannot infer one from a zod contract, and
 * nothing has annotated the routes with a DTO yet.
 *
 * The shape is not unknown: it is the contract type the controller returns, and
 * `@repo/contracts` is where both sides read it from. This says that in one
 * place rather than casting at fifty call sites, and it is the one thing to
 * delete once the api declares its responses.
 */
export function asBody<TBody>(data: unknown, fallback: TBody): TBody {
  return (data as TBody | undefined) ?? fallback
}

/** For a response that cannot legitimately be empty. */
export function expectBody<TBody>(data: unknown): TBody {
  if (data === undefined || data === null) throw new Error('the api answered with no body')

  return data as TBody
}
