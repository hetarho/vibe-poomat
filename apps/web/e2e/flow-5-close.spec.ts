import {
  createProject,
  creditCounter,
  expect,
  openMission,
  signInAs,
  test,
  uniqueSuffix,
  visit,
} from './support/fixtures'

/**
 * PROJ-6's early close with CRED-5's refund. Nobody took a slot, so the whole
 * escrow comes back — and the confirmation says that before it happens.
 */
test('the maker closes the mission and the unfilled slots come back', async ({
  page,
  accounts,
}) => {
  const suffix = uniqueSuffix()
  const title = `Poomat ${suffix}`
  const maker = await accounts.create(`maker${suffix}`)
  const project = await createProject(maker, title)
  await openMission(maker, project.id, 2)

  await signInAs(page, `maker${suffix}`)
  expect(await creditCounter(page, maker.handle, 'balance')).toBe('0')

  await visit(page, `/projects/${project.id}`)
  await expect(page.getByTestId('mission-state')).toHaveText('Open')
  await page.getByRole('button', { name: 'Close the mission' }).click()

  const dialog = page.getByRole('dialog')
  // CRED-5's two halves, said before the decision
  await expect(dialog).toContainText(/nobody took are refunded/)
  await expect(dialog).toContainText(/stays escrowed until then/)
  await dialog.getByRole('button', { name: 'Close the mission' }).click()

  await expect(page.getByTestId('mission-state')).toHaveText('Closed by the maker')
  await expect(page.getByTestId('refund-summary')).toContainText('all 2 credits came back')

  // CRED-5: and they really did
  expect(await creditCounter(page, maker.handle, 'balance')).toBe('2')

  // PROJ-9: a project with no open mission has no slot badge to show
  await visit(page, '/')
  const card = page.getByRole('article').filter({ hasText: title })
  await expect(card).not.toContainText('slots open')
})
