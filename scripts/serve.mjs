import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.wgsl': 'text/plain; charset=utf-8', '.glsl': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};
const server = createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad URL'); return; }
  const target = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
  if (target !== root && !target.startsWith(root + sep)) {
    res.writeHead(403).end('Forbidden'); return;
  }
  try {
    const file = await stat(target);
    if (!file.isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    createReadStream(target).pipe(res);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(port, host, () => console.log(`\n★ Starfire Engine demo: http://${host}:${port}/\n`));
