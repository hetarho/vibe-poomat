import { expect, test } from '@playwright/test'

test('serves the shell from the server, with no JavaScript at all', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()

  await page.goto('/')

  await expect(page.getByRole('banner')).toContainText('vibe poomat')
  await expect(page.getByRole('main')).toContainText('Trade real feedback for your side project')
  await expect(page.getByRole('contentinfo')).toBeVisible()

  await context.close()
})

test('answers an unknown path with the 404 page', async ({ page }) => {
  await page.goto('/definitely-not-a-page')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('404')
  await expect(page.getByText('That page does not exist.')).toBeVisible()
})
