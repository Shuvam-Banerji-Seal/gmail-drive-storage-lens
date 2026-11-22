// Minimal static file server for the frame source (used by the renderer and for previews).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}
export function serve(root, port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
      const file = join(root, p === '/' ? 'index.html' : p)
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
      res.end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port })))
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await serve(new URL('..', import.meta.url).pathname, Number(process.argv[2] ?? 4180))
  console.log(`http://127.0.0.1:${port}/?play`)
}
