import type { ReactNode } from 'react'

export const PRODUCT_NAME = 'vibe poomat'

type AppShellProps = {
  children: ReactNode
  /** The root route puts the header's account corner here; the shell stays unaware of auth. */
  authSlot?: ReactNode
}

export function AppShell({ children, authSlot }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-semibold text-lg tracking-tight">{PRODUCT_NAME}</span>
          <div data-testid="auth-slot">{authSlot}</div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>

      <footer className="border-border border-t">
        <div className="mx-auto w-full max-w-5xl px-6 py-6 text-muted-foreground text-sm">
          {PRODUCT_NAME}
        </div>
      </footer>
    </div>
  )
}
