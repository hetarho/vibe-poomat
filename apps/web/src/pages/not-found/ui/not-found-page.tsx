import { Link } from '@tanstack/react-router'

export const NOT_FOUND_MESSAGE = 'That page does not exist.'

export function NotFoundPage() {
  return (
    <section>
      <h1 className="font-semibold text-3xl tracking-tight">404</h1>
      <p className="mt-4 text-muted-foreground">{NOT_FOUND_MESSAGE}</p>
      <Link className="mt-6 inline-block underline" to="/">
        Back to the feed
      </Link>
    </section>
  )
}
