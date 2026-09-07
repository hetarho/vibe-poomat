export const HOME_HEADING = 'Trade real feedback for your side project'

export function HomePage() {
  return (
    <section>
      <h1 className="font-semibold text-3xl tracking-tight">{HOME_HEADING}</h1>
      <p className="mt-4 max-w-prose text-muted-foreground">
        Post what you built, spend credits to have people actually use it, and earn credits by
        giving feedback that lands.
      </p>
    </section>
  )
}
