import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const qwen = join(root, '.cache', 'Qwen3.5-0.8B-Q4_K_M.gguf')
if (!existsSync(qwen)) {
  const fetchModels = spawn('node', ['scripts/fetch-models.mjs'], { cwd: root, stdio: 'inherit' })
  const code = await new Promise((resolve) => fetchModels.on('exit', resolve))
  if (code) process.exit(code)
}
if (!existsSync(join(root, '.cache', 'input.wav'))) {
  await import('./gen-speech.mjs')
}

const child = spawn('npx', ['playwright', 'test'], { cwd: root, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 1))
