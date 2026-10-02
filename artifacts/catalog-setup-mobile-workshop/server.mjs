import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.md':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!target.startsWith(root + path.sep) || !mime[path.extname(target)]) { res.writeHead(404); res.end('Not found'); return; }
  try { const body = await readFile(target); res.writeHead(200, {'Content-Type':mime[path.extname(target)],'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}); res.end(body); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT || 3201), '127.0.0.1', () => console.log('Catalog setup workshop: ' + (process.env.PORTLESS_URL || 'ready')));
