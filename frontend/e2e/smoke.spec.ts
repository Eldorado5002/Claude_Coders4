import { expect, test } from '@playwright/test'

test('docket → case file → decision → lesson filed', async ({ page }) => {
  await page.goto('/exceptions')
  await expect(page.getByRole('heading', { name: 'Exceptions' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Exceptions' }).getByRole('link').first().click()
  await expect(page.getByRole('heading', { name: /Precedent’s opinion/ })).toBeVisible()
  await expect(page.getByText('Precedents cited')).toBeVisible()

  await page.getByRole('button', { name: /^Accept/ }).click()
  await page.getByRole('textbox').first().fill('Freight within the ₹5,000 per-trip agreement with Balaji.')
  await page.getByRole('button', { name: 'File decision' }).click()
  await expect(page.getByText('Lesson filed to memory')).toBeVisible()
})

test('trust map shows earned autonomy', async ({ page }) => {
  await page.goto('/trust')
  await expect(page.getByRole('heading', { name: 'Where Precedent has earned autonomy.' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
})

test('command palette offers to ask Precedent', async ({ page }) => {
  await page.goto('/exceptions')
  await expect(page.getByRole('heading', { name: 'Exceptions' })).toBeVisible()
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder(/Search cases/).fill('what is our freight policy?')
  await expect(page.getByText(/Ask Precedent:/)).toBeVisible()
})
