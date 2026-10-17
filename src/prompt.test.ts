import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTranslatePrompt, stripThink, voiceAction } from './prompt.ts'

test('prompt asks for English only and prefills an empty think block', () => {
  const prompt = buildTranslatePrompt('今天天气很好')
  assert.match(prompt, /Translate this Chinese sentence into English/)
  assert.match(prompt, /Do not paraphrase/)
  assert.match(prompt, /Output only the English sentence/)
  assert.match(prompt, /今天天气很好/)
  assert.match(prompt, /<think>\n\n<\/think>/)
  assert.equal(prompt.includes('/no_think'), false)
})

test('think tags are removed from the visible English', () => {
  const raw = '<think>planning</think>The weather is good.<|im_end|>'
  assert.equal(stripThink(raw), 'The weather is good.')
  assert.equal(stripThink(raw).includes('<think>'), false)
})

test('speak switch off does not select a voice engine', () => {
  assert.equal(voiceAction(false, 'piper'), 'off')
  assert.equal(voiceAction(false, 'browser'), 'off')
  assert.equal(voiceAction(true, 'piper'), 'piper')
  assert.equal(voiceAction(true, 'browser'), 'browser')
})
