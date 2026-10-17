import { createReadStream, existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Connect, type Plugin } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

function modelCache(): Plugin {
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const name = basename((req.url || '').split('?')[0] || '')
    const file = join(root, '.cache', name)
    if (!name || name === '.' || !existsSync(file)) {
      next()
      return
    }
    const stat = statSync(file)
    res.statusCode = 200
    res.setHeader('content-type', 'application/octet-stream')
    res.setHeader('content-length', String(stat.size))
    res.setHeader('access-control-allow-origin', '*')
    createReadStream(file).pipe(res)
  }
  return {
    name: 'model-cache',
    configureServer(server) {
      server.middlewares.use('/model-cache', serve)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/model-cache', serve)
    },
  }
}

const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [modelCache()],
  server: { host: '127.0.0.1', port: 4179, strictPort: true },
  preview: { host: '127.0.0.1', port: 4179, strictPort: true },
})
