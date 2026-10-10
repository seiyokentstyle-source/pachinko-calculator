import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('./dist/', import.meta.url);
const types = { html:'text/html; charset=utf-8', css:'text/css; charset=utf-8', mjs:'text/javascript; charset=utf-8', svg:'image/svg+xml' };
http.createServer(async (req,res) => {
  try {
    const pathname = new URL(req.url,'http://localhost').pathname;
    const file = new URL(pathname==='/' ? 'index.html' : `.${pathname}`,root);
    if (!fileURLToPath(file).startsWith(fileURLToPath(root))) { res.writeHead(403); return res.end(); }
    const content = await readFile(file); res.writeHead(200,{'Content-Type':types[file.pathname.split('.').pop()] ?? 'application/octet-stream','Cache-Control':'no-store'}); res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4179,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4179'));
