import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

/** This is a local development server, not a production static file server. */
const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wgsl', 'text/plain; charset=utf-8'],
  ['.glsl', 'text/plain; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.bin', 'application/octet-stream'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'],
  ['.ktx2', 'image/ktx2']
]);
const PUBLIC_FOLDERS = new Set(['src', 'demo', 'assets']);

function inside(parent, file) {
  const path = relative(parent, file);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function route(reqUrl) {
  if (typeof reqUrl !== 'string') return null;
  let path;
  try {
    // Validate the unnormalized URL path as well: URL() normalizes literal `..`.
    const rawPath = reqUrl.split(/[?#]/, 1)[0];
    path = decodeURIComponent(rawPath);
  } catch { return null; }
  if (!path.startsWith('/') || path.includes('\\') || path.includes('\0')) return null;
  const segments = path.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.startsWith('.'))) return null;
  if (path === '/' || path === '/index.html') return '/index.html';
  if (segments.length < 2 || !PUBLIC_FOLDERS.has(segments[0])) return null;
  if (!MIME.has(extname(segments.at(-1)).toLowerCase())) return null;
  return `/${segments.join('/')}`;
}

/**
 * Creates a local static server with explicit file and directory allowlists.
 * All filesystem paths are verified after symlink resolution.
 */
export function createStaticServer({ root } = {}) {
  if (!root) throw new TypeError('createStaticServer requires a project root');
  const absoluteRoot = resolve(root);
  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
      return;
    }
    const pathname = route(req.url);
    if (!pathname) { res.writeHead(403).end('Forbidden'); return; }
    const destination = resolve(absoluteRoot, `.${pathname}`);
    const relativeRequested = relative(absoluteRoot, destination);
    if (!inside(absoluteRoot, destination) || relativeRequested.split(sep).some((part) => part.startsWith('.'))) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    try {
      const actual = await realpath(destination);
      if (!inside(absoluteRoot, actual)) { res.writeHead(403).end('Forbidden'); return; }
      const relativeActual = relative(absoluteRoot, actual);
      const actualSegments = relativeActual.split(sep);
      if (actualSegments.some((part) => part.startsWith('.')) ||
          (relativeActual !== 'index.html' && (actualSegments.length < 2 || !PUBLIC_FOLDERS.has(actualSegments[0])))) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const file = await stat(actual);
      if (!file.isFile()) { res.writeHead(404).end('Not found'); return; }
      const contentType = MIME.get(extname(actual).toLowerCase());
      if (!contentType) { res.writeHead(403).end('Forbidden'); return; }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': file.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      });
      if (req.method === 'HEAD') res.end();
      else createReadStream(actual).on('error', () => res.destroy()).pipe(res);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') res.writeHead(404).end('Not found');
      else res.writeHead(500).end('Server error');
    }
  });
}
