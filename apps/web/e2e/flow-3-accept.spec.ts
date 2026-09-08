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
 * FDBK-6's accept and CRED-4's payout, seen from both ends: the credit leaves
 * the maker's escrow and lands on the feedbacker's public counters.
 */
test('the maker accepts and the credit moves to the feedbacker', async ({ page, accounts }) => {
  const suffix = uniqueSuffix()
  const maker = await accounts.create(`maker${suffix}`)
  const giver = await accounts.create(`giver${suffix}`)
  const project = await createProject(maker, `Poomat ${suffix}`)
  const mission = await openMission(maker, project.id, 2)
  const claim = await claimSlot(giver, mission.id)
  const report = await submitReport(giver, claim.id)

  await signInAs(page, `maker${suffix}`)
  await visit(page, `/feedbacks/${report.id}`)

  // FDBK-7's deadline is on the page before anything is decided
  await expect(page.getByTestId('settle-deadline')).toContainText('You have until')
  await expect(page.getByTestId('report-state')).toHaveText('Waiting on the maker')

  // CRED-4 stated before the button, not after it
  await expect(page.getByText(/One credit leaves escrow/)).toBeVisible()
  await page.getByRole('button', { name: 'Accept' }).click()

  await expect(page.getByTestId('report-state')).toHaveText('Accepted by the maker')
  await expect(page.getByTestId('settle-deadline')).toBeHidden()

  // CRED-4: one credit to the feedbacker, on top of the two CRED-2 seeded it
  expect(await creditCounter(page, giver.handle, 'balance')).toBe('3')
  expect(await creditCounter(page, giver.handle, 'received')).toBe('1')
  // CRED-7 makes both sides of the movement public
  expect(await creditCounter(page, maker.handle, 'given')).toBe('1')

  // one slot is settled now, and the other is still there to take (PROJ-6)
  await visit(page, `/projects/${project.id}`)
  await expect(page.getByTestId('slots-settled')).toHaveText('1')
  await expect(page.getByTestId('slots-claimable')).toHaveText('1')
})
