import {
  creditCounter,
  expect,
  REACHABLE_URL,
  signInAs,
  test,
  uniqueSuffix,
  visit,
} from './support/fixtures'

/**
 * Signup to first mission. Every step here goes through the browser, because
 * every step is the thing being tested: CRED-2's seed, PROJ-1's form, PROJ-2's
 * server-side URL check, and CRED-3 moving the whole seed into escrow.
 */
test('a new account posts a project and spends its seed on a mission', async ({ page }) => {
  const suffix = uniqueSuffix()
  const title = `Poomat ${suffix}`
  const { handle } = await signInAs(page, `maker${suffix}`)

  // CRED-2: two credits on account creation, which is what pays for two slots
  expect(await creditCounter(page, handle, 'balance')).toBe('2')

  await visit(page, '/projects/new')
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Live URL').fill(REACHABLE_URL)
  await page.getByLabel('Pitch').fill('Trade real feedback for your side project.')
  await page.getByRole('button', { name: 'Tool' }).click()
  await page.getByRole('button', { name: 'Post project' }).click()

  // PROJ-12: public the moment it is posted, and the page it lands on is its own
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await expect(page.getByRole('link', { name: /Open poomat-fixture.test/ })).toBeVisible()

  await page.getByLabel('What should a feedbacker try?').fill('Sign up and tell me what broke.')
  await page.getByLabel('Slots').fill('2')
  await expect(page.getByTestId('cost-preview')).toContainText('Costs 2 credits')
  await page.getByRole('button', { name: 'Open the mission' }).click()

  // the escrow is what a reader sees as two slots waiting to be taken
  await expect(page.getByTestId('mission-state')).toHaveText('Open')
  await expect(page.getByTestId('slots-claimable')).toHaveText('2')
  await expect(page.getByTestId('slots-total')).toHaveText('2')

  // CRED-3: the balance is gone, because all of it is in escrow behind the slots
  expect(await creditCounter(page, handle, 'balance')).toBe('0')

  // and the mission is what the feed now shows about it (PROJ-9)
  await visit(page, '/')
  const card = page.getByRole('article').filter({ hasText: title })
  await expect(card).toContainText('2 slots open')
})
