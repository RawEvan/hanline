import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(root, '.cache')
mkdirSync(cache, { recursive: true })

const first = join(cache, 'clause-a.wav')
const second = join(cache, 'clause-b.wav')
const out = join(cache, 'input.wav')

function say(text, destAiff, destWav) {
  const aiff = destWav.replace(/\.wav$/, '.aiff')
  const spoken = spawnSync('say', ['-v', 'Tingting', '-r', '120', '-o', aiff, text], { stdio: 'inherit' })
  if (spoken.status) process.exit(spoken.status || 1)
  const converted = spawnSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', aiff, destWav], { stdio: 'inherit' })
  if (converted.status) process.exit(converted.status || 1)
  void destAiff
}

say('今天天气很好。', '', first)
say('我喜欢喝茶。', '', second)

const script = `
import wave, sys
paths = sys.argv[1:]
out = paths[-1]
sources = paths[:-1]
frames = []
with wave.open(sources[0]) as first:
    rate, width, channels = first.getframerate(), first.getsampwidth(), first.getnchannels()
def read(path):
    with wave.open(path) as src:
        return src.readframes(src.getnframes())
frames.append(read(sources[0]))
frames.append(b"\\x00" * rate * 8 * width * channels)
frames.append(read(sources[1]))
frames.append(b"\\x00" * rate * 4 * width * channels)
body = b"".join(frames)
with wave.open(out, "w") as dst:
    dst.setnchannels(channels)
    dst.setsampwidth(width)
    dst.setframerate(rate)
    dst.writeframes(body)
print(int(len(body) / (rate * width * channels) * 1000))
`
const py = spawnSync('python3', ['-c', script, first, second, out], { encoding: 'utf8' })
if (py.status) {
  process.stderr.write(py.stderr || '')
  process.exit(py.status || 1)
}
const ms = py.stdout.trim().split('\n').pop()
writeFileSync(join(cache, 'input-ms.txt'), `${ms}\n`)
console.log('wav', out, 'ms', ms)
