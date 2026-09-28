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

test('risk page ranks every vendor', async ({ page }) => {
  await page.goto('/risk')
  await expect(page.getByRole('heading', { name: 'Where to look twice.' })).toBeVisible()
  // Week 3 fixtures: no vendor has a signal yet, so the ranking is one quiet list
  await expect(page.getByText('Shree Balaji Steel Traders Pvt Ltd').first()).toBeVisible()
})

test('the certificate chip leads to trust you can check', async ({ page }) => {
  await page.goto('/trust')
  await page.getByRole('link', { name: /Collecting evidence|Certified|Auto-pay paused/ }).click()
  await expect(page).toHaveURL(/\/learning#trust$/)
  await expect(page.getByText('Trust you can check')).toBeInViewport()
})

test('a sample invoice with no IRN is held by the e-invoice control', async ({ page }) => {
  await page.goto('/capture')
  await page.getByRole('button', { name: /No IRN/ }).click()
  await expect(page.getByText('Held: no e-invoice IRN.', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: /Open case/ }).click()
  await expect(page.getByText('Action forced to hold.')).toBeVisible()
})
