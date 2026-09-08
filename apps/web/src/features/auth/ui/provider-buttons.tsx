import { Button } from '../../../shared/ui'
import { SIGN_IN_PROVIDERS, signInUrl } from '../lib/provider-url'

type ProviderButtonsProps = {
  /** Where to come back to; null means the site root. */
  returnTo: string | null
}

/**
 * AUTH-1's two ways in and nothing else — there is no password field anywhere in
 * this app, which AUTH-10 decided deliberately rather than by omission.
 *
 * Plain anchors, not fetches: OAuth is a full-page redirect, and the cookies the
 * api sets on the way out have to reach the browser that started it.
 */
export function ProviderButtons({ returnTo }: ProviderButtonsProps) {
  return (
    <div className="flex flex-col gap-2">
      {SIGN_IN_PROVIDERS.map((provider) => (
        <Button key={provider.id} asChild variant="outline" className="w-full">
          <a href={signInUrl(provider.id, returnTo)} data-testid={`sign-in-${provider.id}`}>
            {provider.label}
          </a>
        </Button>
      ))}
    </div>
  )
}
