import assert from 'node:assert/strict'
import test from 'node:test'
import { assetUrl } from './asset.ts'

test('assetUrl keeps root base paths rooted', () => {
  assert.equal(assetUrl('/engine-worker.js', '/'), '/engine-worker.js')
  assert.equal(assetUrl('vendor/wllama.wasm', '/'), '/vendor/wllama.wasm')
})

test('assetUrl prefixes a project Pages base', () => {
  assert.equal(assetUrl('/engine-worker.js', '/hanline/'), '/hanline/engine-worker.js')
  assert.equal(assetUrl('vendor/wllama.wasm', '/hanline/'), '/hanline/vendor/wllama.wasm')
  assert.equal(assetUrl('/sw.js', '/hanline/'), '/hanline/sw.js')
})
