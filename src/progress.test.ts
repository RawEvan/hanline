import assert from 'node:assert/strict'
import test from 'node:test'
import { progressLabel } from './progress.ts'

const MB = 1024 * 1024

test('download progress names percent and size', () => {
  const view = progressLabel('Chinese dictation', {
    received: 180 * MB,
    total: 400 * MB,
    phase: 'download',
  })
  assert.equal(view.text, 'Chinese dictation 45% · 180.0 / 400.0 MB')
  assert.equal(view.ratio, 0.45)
})

test('checksum and save phases stay visible', () => {
  assert.equal(
    progressLabel('Translation model', { received: 10, total: 100, phase: 'check' }).text,
    'Checking Translation model…',
  )
  assert.equal(
    progressLabel('English voice', { received: 10, total: 100, phase: 'save' }).text,
    'Saving English voice…',
  )
})

test('small files use kilobytes', () => {
  const view = progressLabel('Chinese dictation', { received: 20 * 1024, total: 74 * 1024, phase: 'download' })
  assert.equal(view.text, 'Chinese dictation 27% · 20 / 74 KB')
})
