import { expect, test } from '@playwright/test'

test('clear downloads confirms, then removes saved model files', async ({ page }) => {
  test.setTimeout(45_000)
  await page.route('**/model-cache/**', (route) => route.fulfill({ status: 404, body: 'missing' }))
  await page.route('https://huggingface.co/**', (route) => route.abort())
  await page.route('https://www.modelscope.cn/**', (route) => route.abort())
  await page.goto('/')
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const saved = await root.getFileHandle('asr-encoder.int8.onnx', { create: true })
    const writable = await saved.createWritable()
    await writable.write(new Uint8Array([1, 2, 3]))
    await writable.close()
    const note = await root.getFileHandle('keep-notes.txt', { create: true })
    const noteWritable = await note.createWritable()
    await noteWritable.write(new Uint8Array([4]))
    await noteWritable.close()
  })

  await page.getByRole('button', { name: 'Clear downloads' }).click()
  await expect(page.getByRole('button', { name: 'Remove saved models' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Clear downloads' })).toBeVisible()

  await page.getByRole('button', { name: 'Clear downloads' }).click()
  await page.getByRole('button', { name: 'Remove saved models' }).click()
  await expect(page.locator('.status')).toContainText('Saved models removed')
  await expect(page.getByRole('button', { name: 'Hold to listen' })).toBeDisabled()

  const left = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const has = async (name: string) => {
      try {
        await root.getFileHandle(name)
        return true
      } catch {
        return false
      }
    }
    return { model: await has('asr-encoder.int8.onnx'), note: await has('keep-notes.txt') }
  })
  expect(left.model).toBe(false)
  expect(left.note).toBe(true)
})
