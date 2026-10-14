// Local runner — no Vercel CLI needed.
//   npm install
//   node server.js        → http://localhost:3000
// Uses APP_PASSWORD from .env.local; data saved to data/data.json.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from './api/data.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
process.chdir(dir);
const PORT = Number(process.env.PORT) || 3000;

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/data')) {
      let body = '';
      for await (const chunk of req) body += chunk;
      try { req.body = body ? JSON.parse(body) : undefined; } catch { req.body = body; }
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
      return await handler(req, res);
    }
    const html = await readFile(path.join(dir, 'index.html'));
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(html);
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end('Server error: ' + e.message);
  }
}).listen(PORT, () => console.log(`Full Feature Plan running → http://localhost:${PORT}`));
