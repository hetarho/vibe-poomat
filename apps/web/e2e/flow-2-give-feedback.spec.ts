import {
  createProject,
  ENOUGH,
  expect,
  MISSION_TASK,
  openMission,
  signInAs,
  test,
  uniqueSuffix,
  visit,
} from './support/fixtures'

/**
 * Giving feedback, from finding the project to seeing the report waiting on a
 * decision. The maker's side is seeded through the api — it is flow 1's subject,
 * not this one's — and everything the feedbacker does is done in the browser.
 */
test('a second account claims a slot and turns in a report', async ({ page, accounts }) => {
  const suffix = uniqueSuffix()
  const title = `Poomat ${suffix}`
  const maker = await accounts.create(`maker${suffix}`)
  const project = await createProject(maker, title)
  await openMission(maker, project.id, 2)

  await signInAs(page, `giver${suffix}`)

  // PROJ-9 puts a project with open slots in the feed, badge and all
  await visit(page, '/')
  const card = page.getByRole('article').filter({ hasText: title })
  await expect(card).toContainText('2 slots open')
  await card.getByRole('link', { name: title }).click()

  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await page.getByRole('button', { name: 'Start — take a slot' }).click()

  // FDBK-1: the hold is a day, and the page says how much of it is left
  await expect(page.getByTestId('hold-countdown')).toContainText('left')
  await expect(page.getByTestId('slots-claimable')).toHaveText('1')

  await page.getByRole('link', { name: 'Write the report' }).click()

  // PROJ-7 froze the task, and this is what it was
  await expect(page.getByText(MISSION_TASK)).toBeVisible()

  await page.getByLabel('First impression').fill(`${ENOUGH} First impression.`)
  await page.getByLabel('Where I got stuck').fill(`${ENOUGH} The second step.`)
  await page.getByRole('radio', { name: 'Yes' }).check()
  await page.getByLabel('Why, or why not').fill(`${ENOUGH} It saves me an hour.`)
  await page.getByLabel('One suggestion').fill(`${ENOUGH} Label the button.`)
  await page.getByRole('button', { name: 'Submit the report' }).click()

  // FDBK-4: no way back, and FDBK-7's window said out loud
  await expect(page.getByRole('heading', { level: 1, name: 'Your report is in' })).toBeVisible()
  await expect(page.getByText(/72 hours/)).toBeVisible()

  // and the project now shows it, waiting on the maker (FDBK-9)
  await visit(page, `/projects/${project.id}`)
  await expect(page.getByRole('region', { name: 'Feedback' })).toContainText('Waiting on the maker')
  await expect(page.getByTestId('slots-submitted')).toHaveText('1')
})
