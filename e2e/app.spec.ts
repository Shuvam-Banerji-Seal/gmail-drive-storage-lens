// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from '@playwright/test'
import { CLIENT_ID, mockGoogle } from './google-mock'

// The first-run tour is covered by its own test; elsewhere start with it dismissed so it never covers buttons.
test.beforeEach(async ({ page }, info) => {
  if (info.title.includes('guided tour')) return
  await page.addInitScript(() => {
    if (!localStorage.getItem('gsl.settings.v1')) localStorage.setItem('gsl.settings.v1', JSON.stringify({ tourDone: true }))
  })
})

test.describe('static & privacy', () => {
  test('landing page has SEO metadata and a strict CSP', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Gmail Storage Lens/)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Gmail/)
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(csp).toContain("default-src 'none'")
    expect(csp).not.toContain('unsafe-eval')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('filling your Google storage')
  })

  test('the teaser film is served from this site and the CSP allows it', async ({ page, request }) => {
    await page.goto('/')
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(csp).toContain("media-src 'self'")
    const video = page.locator('video.film')
    await expect(video).toHaveAttribute('poster', /teaser-poster\.jpg$/)
    const src = await video.locator('source').getAttribute('src')
    const res = await request.get(src!)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('video/mp4')
    expect((await res.body()).length).toBeGreaterThan(1_000_000)
  })

  test('demo mode makes no request outside this site', async ({ page }) => {
    const external: string[] = []
    page.on('request', (r) => {
      const u = new URL(r.url())
      if (u.hostname !== 'localhost') external.push(r.url())
    })
    await page.goto('/')
    await page.getByRole('button', { name: /Explore the demo/ }).click()
    await expect(page.getByRole('heading', { name: 'Your storage orbit' })).toBeVisible()
    for (const tab of ['senders', 'constellation', 'rivers', 'tides', 'mailfall', 'nebula', 'repeats', 'attachments', 'unsubscribe']) {
      await page.goto(`/#/gmail/${tab}`)
      await expect(page.locator('main h2').first()).toBeVisible()
    }
    for (const tab of ['continents', 'twins', 'ghosts', 'cold', 'public', 'sharing']) {
      await page.goto(`/#/drive/${tab}`)
      await expect(page.locator('main h2').first()).toBeVisible()
    }
    for (const route of ['insights', 'planner', 'cleanup', 'settings']) {
      await page.goto(`/#/${route}`)
      await expect(page.locator('main h1').first()).toBeVisible()
    }
    expect(external).toEqual([])
  })

  test('the CSP blocks a request to a non-Google host', async ({ page }) => {
    await page.goto('/#/verify')
    await page.getByRole('button', { name: /Try to contact example.com/ }).click()
    await expect(page.getByText(/Blocked by your browser/)).toBeVisible()
  })
})

test.describe('onboarding', () => {
  test('guided tour appears once and can be skipped', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Explore the demo/ }).click()
    const tour = page.getByRole('dialog')
    await expect(tour).toBeVisible()
    await tour.getByRole('button', { name: /Next/ }).click()
    await tour.getByRole('button', { name: /Skip/ }).click()
    await expect(tour).toHaveCount(0)
    await page.reload()
    await page.getByRole('button', { name: /Explore the demo/ }).click()
    await expect(page.getByRole('heading', { name: 'Your storage orbit' })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('demo airlock', () => {
  test('permanent delete stays disabled until the exact phrase is typed', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Explore the demo/ }).click()
    await page.locator('.barlist button, [data-testid="barlist-row"]').first().click()
    await page.goto('/#/cleanup')
    const del = page.getByRole('button', { name: /Permanently delete/ })
    await expect(del).toBeDisabled()
    const label = await del.textContent()
    const n = /delete ([\d,]+) items/.exec(label ?? '')![1]!.replace(/,/g, '')
    await page.getByLabel('Confirmation text').fill(`DELETE ${Number(n) + 1}`)
    await expect(del).toBeDisabled()
    await page.getByLabel('Confirmation text').fill(`DELETE ${n}`)
    await expect(del).toBeEnabled()
  })
})

test.describe('live flow against a mocked Google', () => {
  test('setup wizard validates the client id', async ({ page }) => {
    await page.goto('/#/setup')
    await page.getByRole('button', { name: /Step 5/ }).click()
    const input = page.getByPlaceholder(/apps.googleusercontent.com/)
    await input.fill('not-a-client-id')
    await expect(page.getByText('That does not look like a Client ID yet.')).toBeVisible()
    await input.fill(`{"web":{"client_id":"${CLIENT_ID}"}}`)
    await expect(page.getByText('Looks like a valid Client ID')).toBeVisible()
  })

  async function connectAndScan(page: import('@playwright/test').Page) {
    const calls = await mockGoogle(page)
    await page.goto('/#/setup')
    await page.getByRole('button', { name: /Step 5/ }).click()
    await page.getByPlaceholder(/apps.googleusercontent.com/).fill(CLIENT_ID)
    await page.getByRole('button', { name: 'Sign in and test' }).click()
    await expect(page.getByText(/Gmail API reachable/)).toBeVisible()
    await page.getByRole('button', { name: /Start the scan/ }).click()
    await expect(page.getByText(/Scan complete/)).toBeVisible({ timeout: 30_000 })
    return calls
  }

  test('scan never requests message bodies; trash sends exactly the selected ids', async ({ page }) => {
    const calls = await connectAndScan(page)
    expect(calls.some((c) => /format=(full|raw)/.test(c.url))).toBe(false)
    expect(calls.every((c) => /^https:\/\/(www|gmail)\.googleapis\.com\//.test(c.url))).toBe(true)
    await page.goto('/#/gmail/senders')
    await page.locator('.barlist button, [data-testid="barlist-row"]').first().click()
    await page.getByRole('button', { name: /Add \d+ emails to Airlock/ }).click()
    await page.goto('/#/cleanup')
    await page.getByRole('button', { name: /Move \d+ items to Trash/ }).click()
    await expect(page.getByText(/Moved \d+ items/)).toBeVisible()
    const mod = calls.find((c) => c.url.endsWith('/messages/batchModify'))
    expect(mod).toBeTruthy()
    const body = mod!.body as { ids: string[]; addLabelIds: string[] }
    expect(body.addLabelIds).toEqual(['TRASH'])
    expect(body.ids.length).toBeGreaterThan(0)
    expect(body.ids).not.toContain('m4') // starred + important: protected
    expect(calls.some((c) => c.url.endsWith('/batchDelete'))).toBe(false)
  })

  test('permanent delete calls batchDelete only after typed confirmation', async ({ page }) => {
    const calls = await connectAndScan(page)
    await page.goto('/#/overview')
    await page.locator('.barlist button, [data-testid="barlist-row"]').first().click()
    await page.goto('/#/cleanup')
    const del = page.getByRole('button', { name: /Permanently delete/ })
    const n = /delete ([\d,]+) items/.exec((await del.textContent()) ?? '')![1]!
    expect(calls.some((c) => c.url.endsWith('/batchDelete'))).toBe(false)
    await page.getByLabel('Confirmation text').fill(`DELETE ${n}`)
    await del.click()
    await expect(page.getByText(/Permanently deleted/)).toBeVisible()
    const bd = calls.find((c) => c.url.endsWith('/messages/batchDelete'))
    expect((bd!.body as { ids: string[] }).ids).not.toContain('m4')
  })
})
