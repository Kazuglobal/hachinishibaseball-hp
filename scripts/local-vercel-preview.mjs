// Throwaway local server that mimics vercel.json's rewrite rules
// (explicit page -> page.html mappings, else the SPA catch-all) so we can
// verify the generated canonical shells behave correctly before deploying.
// Not part of the build; run manually with `node scripts/local-vercel-preview.mjs`.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const DIST_DIR = resolve(import.meta.dirname, '..', 'dist');
const PORT = 4400;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function fileExists(path) {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  // 1) literal static file (assets, sitemap.xml, favicon, etc.)
  const literalPath = join(DIST_DIR, pathname);
  if (pathname !== '/' && (await fileExists(literalPath))) {
    const body = await readFile(literalPath);
    res.writeHead(200, { 'content-type': MIME[extname(literalPath)] || 'application/octet-stream' });
    res.end(body);
    return;
  }

  // 2) explicit page.html rewrite (mirrors vercel.json's per-route entries)
  if (pathname !== '/') {
    const pageHtmlPath = `${join(DIST_DIR, pathname)}.html`;
    if (await fileExists(pageHtmlPath)) {
      const body = await readFile(pageHtmlPath);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
      return;
    }
  }

  // 3) SPA catch-all fallback
  const body = await readFile(join(DIST_DIR, 'index.html'));
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}).listen(PORT, () => {
  console.log(`local-vercel-preview: serving dist/ on http://localhost:${PORT}`);
});
