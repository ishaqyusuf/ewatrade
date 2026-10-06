import { resolve, extname } from 'node:path'
const root = resolve(import.meta.dir)
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.md':'text/plain; charset=utf-8'}
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PORT ?? 4791),
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname)
    const target = resolve(root, '.' + (path === '/' ? '/index.html' : path))
    if (target !== root && !target.startsWith(root + '/')) return new Response('Not found',{status:404})
    const file = Bun.file(target)
    if(!await file.exists())return new Response('Not found',{status:404})
    return new Response(file,{headers:{'Content-Type':mime[extname(target)] ?? 'application/octet-stream','Cache-Control':'no-store'}})
  }
})
console.log(`Email workshop preview: ${process.env.PORTLESS_URL ?? `http://localhost:${server.port}`} (backing port ${server.port})`)
