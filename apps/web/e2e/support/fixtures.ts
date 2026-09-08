import type { BrowserContext, Page } from '@playwright/test'
import { test as base, expect } from '@playwright/test'

/**
 * `.test` is reserved (RFC 6761) and can never resolve, which is exactly why the
 * test-mode probe answers for it: PROJ-2 stays enforced and nothing reaches the
 * public internet.
 */
export const REACHABLE_URL = 'https://poomat-fixture.test/app'

export const MISSION_TASK = 'Sign up and tell me where it went wrong.'
export const ENOUGH = 'This is a long enough answer to pass the twenty character floor.'

/** Unique per flow, so parallel specs never collide over a handle or a title. */
export function uniqueSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Navigates and waits until the page can actually be clicked. TanStack Start
 * deletes `window.$_TSR` once it has both hydrated and finished streaming, so
 * that is the signal: without it Playwright clicks the server-rendered markup
 * before React has attached anything and the press does nothing at all.
 */
export async function visit(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState('load')
  await page.waitForFunction(() => (window as unknown as { $_TSR?: unknown }).$_TSR === undefined)
}

type ApiResult = { ok: boolean; status: number; body: unknown }

/**
 * Every api call the fixtures make runs inside the browser, not through
 * Playwright's request client. The session cookie is `Secure` (ARCH-18) and only
 * a browser treats loopback as a secure origin — the request client will not
 * send it over http, so a seeded actor driven that way would look signed out.
 */
async function api(page: Page, method: string, path: string, body?: unknown): Promise<ApiResult> {
  return page.evaluate(
    async ({ method: verb, path: url, body: payload }) => {
      const response = await fetch(url, {
        method: verb,
        headers: payload === undefined ? {} : { 'content-type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      })
      const text = await response.text()

      return {
        ok: response.ok,
        status: response.status,
        body: text.length === 0 ? null : (JSON.parse(text) as unknown),
      }
    },
    { method, path, body },
  )
}

async function expectOk(result: ApiResult, what: string): Promise<ApiResult> {
  if (!result.ok) throw new Error(`${what} failed with ${result.status}`)

  return result
}

export type Account = {
  id: string
  handle: string
  /** The browser this account acts through; api calls run inside it. */
  page: Page
}

async function issueSession(page: Page, name: string): Promise<{ id: string; handle: string }> {
  // a relative fetch needs an origin, so the actor lands on the site first
  await visit(page, '/')
  const result = await expectOk(
    await api(page, 'POST', '/api/v1/test-support/session', {
      providerUserId: `e2e-${name}`,
      username: name,
      email: `${name}@example.test`,
    }),
    `the test-only sign-in for ${name}`,
  )

  return result.body as { id: string; handle: string }
}

/** Signs the page under test in, and hands back what the account became. */
export async function signInAs(page: Page, name: string): Promise<{ id: string; handle: string }> {
  return issueSession(page, name)
}

export type Accounts = {
  /** Another actor with its own session, for the setup a flow is not testing. */
  create(name: string): Promise<Account>
}

export const test = base.extend<{ accounts: Accounts }>({
  accounts: async ({ browser, baseURL }, use) => {
    const opened: BrowserContext[] = []

    await use({
      async create(name: string): Promise<Account> {
        const context = await browser.newContext({ baseURL })
        opened.push(context)
        const page = await context.newPage()

        return { ...(await issueSession(page, name)), page }
      },
    })

    // closed here rather than by each spec, so a worker does not accumulate them
    await Promise.all(opened.map((context) => context.close()))
  },
})

export { expect }

type CreatedProject = { id: string; title: string }

export async function createProject(
  account: Account,
  title: string,
  overrides: Record<string, unknown> = {},
): Promise<CreatedProject> {
  const result = await expectOk(
    await api(account.page, 'POST', '/api/v1/projects', {
      title,
      liveUrl: REACHABLE_URL,
      pitch: 'Trade real feedback for your side project.',
      tags: ['Tool'],
      ...overrides,
    }),
    'creating a project',
  )

  return result.body as CreatedProject
}

export async function openMission(
  account: Account,
  projectId: string,
  slots = 2,
): Promise<{ id: string }> {
  const result = await expectOk(
    await api(account.page, 'POST', `/api/v1/projects/${projectId}/missions`, {
      taskText: MISSION_TASK,
      slots,
    }),
    'opening a mission',
  )

  return result.body as { id: string }
}

export async function claimSlot(account: Account, missionId: string): Promise<{ id: string }> {
  const result = await expectOk(
    await api(account.page, 'POST', `/api/v1/missions/${missionId}/claims`),
    'claiming a slot',
  )

  return result.body as { id: string }
}

export async function submitReport(account: Account, claimId: string): Promise<{ id: string }> {
  const result = await expectOk(
    await api(account.page, 'POST', `/api/v1/claims/${claimId}/feedback`, {
      firstImpression: `${ENOUGH} First impression.`,
      stuckAt: `${ENOUGH} Where I got stuck.`,
      wouldPay: true,
      wouldPayReason: `${ENOUGH} Why I would pay.`,
      suggestion: `${ENOUGH} One suggestion.`,
      answers: [],
    }),
    'submitting a report',
  )

  return result.body as { id: string }
}

/** What the profile page shows for one of CRED-7's three public counters. */
export async function creditCounter(
  page: Page,
  handle: string,
  key: 'balance' | 'received' | 'given',
): Promise<string> {
  await visit(page, `/@${handle}`)

  return (await page.getByTestId(`credits-${key}`).innerText()).trim()
}
