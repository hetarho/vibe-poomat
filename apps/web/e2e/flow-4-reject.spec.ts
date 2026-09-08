import {
  claimSlot,
  createProject,
  creditCounter,
  expect,
  openMission,
  signInAs,
  submitReport,
  test,
  uniqueSuffix,
  visit,
} from './support/fixtures'

/**
 * FDBK-6's rejection: the credit comes back, the report stays public with its
 * reason (FDBK-9), and FDBK-8 puts that on the maker's profile — which is the
 * whole reason a rejection is not free.
 */
test('the maker rejects, the credit returns, and the reason stays public', async ({
  page,
  accounts,
  browser,
  baseURL,
}) => {
  const suffix = uniqueSuffix()
  const maker = await accounts.create(`maker${suffix}`)
  const giver = await accounts.create(`giver${suffix}`)
  const project = await createProject(maker, `Poomat ${suffix}`)
  const mission = await openMission(maker, project.id, 2)
  const claim = await claimSlot(giver, mission.id)
  const report = await submitReport(giver, claim.id)

  await signInAs(page, `maker${suffix}`)
  await visit(page, `/feedbacks/${report.id}`)
  await page.getByRole('button', { name: 'Reject' }).click()

  const dialog = page.getByRole('dialog')
  // CRED-4 and FDBK-9 both said before the decision is taken
  await expect(dialog).toContainText(/One credit comes back to your balance/)
  await expect(dialog).toContainText(/stays public/)
  await dialog.getByRole('radio', { name: /Nothing substantial/ }).check()
  await dialog.getByLabel(/Anything to add/).fill('The task was about the export.')
  await dialog.getByRole('button', { name: 'Reject' }).click()

  await expect(page.getByTestId('report-state')).toHaveText('Rejected by the maker')
  await expect(page.getByTestId('rejection')).toContainText('Nothing substantial in it')
  await expect(page.getByTestId('rejection')).toContainText('The task was about the export.')

  // CRED-4: the escrowed credit is the maker's again
  expect(await creditCounter(page, maker.handle, 'balance')).toBe('1')

  // FDBK-8: and the profile says so, to anybody
  await expect(page.getByTestId('rejection-rate')).toHaveText('100%')

  // FDBK-9: a signed-out reader sees the report and the reason all the same
  const visitor = await browser.newContext({ baseURL })
  const anonymous = await visitor.newPage()
  await visit(anonymous, `/feedbacks/${report.id}`)
  await expect(anonymous.getByTestId('rejection')).toContainText('Nothing substantial in it')
  await expect(anonymous.getByRole('button', { name: 'Accept' })).toBeHidden()
  await visitor.close()
})
