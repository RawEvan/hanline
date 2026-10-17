import { expect, test } from '@playwright/test'

test('status shows download percent and size', async ({ page }) => {
  test.setTimeout(45_000)
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('https://huggingface.co/**', async (route) => {
    await gate
    const body = Buffer.alloc(1024, 1)
    await route.fulfill({
      status: 200,
      body,
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(body.length) },
    })
  })
  await page.route('**/model-cache/**', (route) => route.fulfill({ status: 404, body: 'missing' }))
  await page.goto('/')
  const status = page.locator('.status')
  await expect(status).toContainText(/\d+% ·/)
  await expect(status).toContainText('MB')
  release()
})

test('china mirror requests modelscope', async ({ page }) => {
  test.setTimeout(45_000)
  const hosts: string[] = []
  await page.addInitScript(() => localStorage.setItem('hanline.mirror', 'china'))
  await page.route('https://www.modelscope.cn/**', (route) => {
    hosts.push(new URL(route.request().url()).host)
    const body = Buffer.alloc(1024, 2)
    return route.fulfill({
      status: 200,
      body,
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(body.length) },
    })
  })
  await page.route('https://huggingface.co/**', (route) => {
    hosts.push(new URL(route.request().url()).host)
    return route.abort()
  })
  await page.route('**/model-cache/**', (route) => route.fulfill({ status: 404, body: 'missing' }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'China mirror' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => hosts.includes('www.modelscope.cn')).toBe(true)
  expect(hosts.includes('huggingface.co')).toBe(false)
})
