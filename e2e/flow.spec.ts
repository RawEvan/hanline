import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { ASR_FILES, ESPEAK_PACK, PIPER_FILES, translateModel } from '../src/catalog.ts'

const cache = join(process.cwd(), '.cache')

function note(line: string) {
  appendFileSync(join(cache, 'e2e-status.txt'), `${new Date().toISOString()} ${line}\n`)
}

async function waitReady(page: Page, state: string) {
  const started = Date.now()
  while (Date.now() - started < 18 * 60 * 1000) {
    const snap = await page.evaluate(() => ({
      ready: document.querySelector('.status')?.getAttribute('data-ready') || '',
      status: document.querySelector('.status')?.textContent || '',
      error: document.querySelector('.error')?.textContent || '',
    }))
    note(`status=${snap.status} ready=${snap.ready} error=${snap.error}`)
    if (snap.error.trim()) throw new Error(snap.error.trim())
    if (snap.ready === state) return
    await page.waitForTimeout(2000)
  }
  throw new Error(`Timed out waiting for ${state}.`)
}

test.beforeEach(async ({ page }) => {
  const files = new Map<string, string>([
    ...ASR_FILES.map((row) => [row.file, join(cache, row.file)] as const),
    ...PIPER_FILES.map((row) => [row.file, join(cache, row.file)] as const),
    [ESPEAK_PACK.file, join(cache, ESPEAK_PACK.file)],
    [translateModel('qwen35-08b').file, join(cache, translateModel('qwen35-08b').file)],
  ])
  await page.addInitScript((names: string[]) => {
    const allowed = new Set(names)
    const original = window.fetch.bind(window)
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const name = decodeURIComponent(url.split('?')[0].split('/').pop() || '')
      if (allowed.has(name)) return original(`/model-cache/${encodeURIComponent(name)}`, init)
      return original(input as RequestInfo, init)
    }
  }, [...files.keys()])
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    const name = decodeURIComponent(url.split('?')[0].split('/').pop() || '')
    const hit = files.get(name)
    if (url.includes('github.com') || url.includes('huggingface.co') || hit) note(`route ${route.request().method()} ${url}`)
    if (hit && !url.includes('/model-cache/')) {
      await route.abort()
      return
    }
    if (url.includes('github.com') || url.includes('huggingface.co')) {
      await route.abort()
      return
    }
    await route.continue()
  })
})

function writeWav(samples: number[], sampleRate: number, path: string) {
  const buffer = Buffer.alloc(44 + samples.length * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples.length * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7fff, 44 + i * 2)
  }
  writeFileSync(path, buffer)
}

async function hold(page: Page) {
  const button = page.getByRole('button', { name: 'Hold to listen' })
  await expect(button).toBeEnabled()
  const box = await button.boundingBox()
  if (!box) throw new Error('Listen button has no box.')
  const ms = Number(readFileSync(join(cache, 'input-ms.txt'), 'utf8').trim())
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForFunction(() => document.querySelector('[data-listening="live"]'))
  await page.waitForTimeout(Math.max(ms - 1500, 1000))
  await page.mouse.up()
  await page.waitForFunction(
    () => {
      const probe = (window as unknown as { __hanline: { english: string; chinese: string } }).__hanline
      const english = probe.english.toLowerCase()
      return probe.chinese.includes('天气') && english.includes('weather') && english.includes('tea')
    },
    null,
    { timeout: 180000 },
  )
  return page.evaluate(() => {
    const probe = (window as unknown as {
      __hanline: {
        marks: Record<string, number | null>
        chinese: string
        english: string
        utterances: string[]
        samples: Float32Array
        sampleRate: number
      }
    }).__hanline
    let sum = 0
    for (let i = 0; i < probe.samples.length; i++) sum += probe.samples[i] * probe.samples[i]
    return {
      marks: probe.marks,
      chinese: probe.chinese,
      english: probe.english,
      utterances: probe.utterances,
      samples: probe.samples.length,
      sampleRate: probe.sampleRate,
      rms: probe.samples.length ? Math.sqrt(sum / probe.samples.length) : 0,
      pcm: Array.from(probe.samples),
    }
  })
}

test('streaming dictation, translation, and English speech overlap before release', async ({ page }) => {
  test.setTimeout(20 * 60 * 1000)
  await page.goto('/')
  await waitReady(page, 'asr')
  await page.getByRole('button', { name: 'English model' }).click()
  await waitReady(page, 'piper')
  await page.getByRole('switch', { name: 'Speak English' }).click()
  const result = await hold(page)
  const { marks } = result
  expect(marks.firstChinesePartial).not.toBeNull()
  expect(marks.firstEnglishToken).not.toBeNull()
  expect(marks.firstPiperAudio).not.toBeNull()
  expect(marks.released).not.toBeNull()
  expect(marks.firstChinesePartial!).toBeLessThan(marks.released!)
  expect(marks.firstEnglishToken!).toBeLessThan(marks.released!)
  expect(marks.firstPiperAudio!).toBeLessThan(marks.released!)
  expect(result.chinese).toContain('今天')
  expect(result.chinese).toContain('天气')
  expect(result.english.toLowerCase()).toContain('weather')
  expect(result.english.toLowerCase()).toMatch(/good|nice|fine/)
  expect(result.english.toLowerCase()).toContain('tea')
  expect(result.english.includes('<think>')).toBe(false)
  expect(result.samples / result.sampleRate).toBeGreaterThan(0.3)
  expect(result.rms).toBeGreaterThan(0.01)
  mkdirSync(join(cache, 'output'), { recursive: true })
  writeWav(result.pcm, result.sampleRate, join(cache, 'output', 'english.wav'))
})

test('speak switch off still streams text and writes no audio', async ({ page }) => {
  test.setTimeout(20 * 60 * 1000)
  await page.goto('/')
  await waitReady(page, 'asr')
  const result = await hold(page)
  expect(result.marks.firstChinesePartial).not.toBeNull()
  expect(result.marks.firstEnglishToken).not.toBeNull()
  expect(result.marks.firstChinesePartial!).toBeLessThan(result.marks.released!)
  expect(result.marks.firstEnglishToken!).toBeLessThan(result.marks.released!)
  expect(result.marks.firstPiperAudio).toBeNull()
  expect(result.utterances).toEqual([])
  expect(result.samples).toBe(0)
})

test('browser voice speaks the first English clause before release', async ({ page }) => {
  test.setTimeout(20 * 60 * 1000)
  await page.addInitScript(() => {
    const voice = { lang: 'en-US', name: 'English', default: true, localService: true, voiceURI: 'en-US' }
    const spoken: string[] = []
    ;(window as unknown as { __spoken: string[] }).__spoken = spoken
    const NativeUtterance = window.SpeechSynthesisUtterance
    const Utterance = function (this: SpeechSynthesisUtterance, text?: string) {
      const utterance = new NativeUtterance(text)
      let selected: SpeechSynthesisVoice | null = null
      Object.defineProperty(utterance, 'voice', {
        configurable: true,
        get: () => selected,
        set: (value) => {
          selected = value
        },
      })
      return utterance
    } as unknown as typeof SpeechSynthesisUtterance
    window.SpeechSynthesisUtterance = Utterance
    const synth = {
      getVoices: () => [voice],
      speak: (utterance: SpeechSynthesisUtterance) => {
        spoken.push(utterance.text)
        ;(window as unknown as { __voice: string }).__voice = utterance.voice?.lang || utterance.lang
        utterance.onend?.(new Event('end') as SpeechSynthesisEvent)
      },
      cancel() {},
      pause() {},
      resume() {},
      pending: false,
      speaking: false,
      paused: false,
      addEventListener() {},
      removeEventListener() {},
    }
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth })
  })
  await page.goto('/')
  await waitReady(page, 'asr')
  await page.getByRole('switch', { name: 'Speak English' }).click()
  const result = await hold(page)
  expect(result.marks.firstBrowserSpeech).not.toBeNull()
  expect(result.marks.firstBrowserSpeech!).toBeLessThan(result.marks.released!)
  expect(result.utterances[0]?.toLowerCase()).toContain('weather')
  const voice = await page.evaluate(() => (window as unknown as { __voice?: string }).__voice || '')
  expect(voice.toLowerCase().startsWith('en')).toBe(true)
})
