// Full Feature Plan — storage API (plain JSON file, no database, no Blob)
// GET  /api/data  -> { data }        (data is null until first save)
// PUT  /api/data  <- { data }        -> { ok, updatedAt }
// Auth: header "x-app-key" must equal APP_PASSWORD.
//
// Where the JSON file lives:
//   • Vercel  → data.json in a private GitHub repo (env GITHUB_TOKEN + GITHUB_REPO)
//               Vercel's own disk is wiped between requests, so a file there can't persist.
//   • Local   → ./data/data.json on disk (node server.js / vercel dev)
import { createHash, timingSafeEqual } from 'node:crypto';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';

const LOCAL_FILE = path.join(process.cwd(), 'data', 'data.json');
const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const GH_REPO = process.env.GITHUB_REPO || '';            // e.g. "ashoka/ffp-data"
const GH_PATH = process.env.GITHUB_PATH || 'data.json';
const GH_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GH_API = process.env.GITHUB_API || 'https://api.github.com';
const USE_GITHUB = Boolean(GH_TOKEN && GH_REPO);

// ---------- auth ----------
function readFromEnvFiles(key) {
  for (const f of ['.env.local', '.env']) {
    try {
      const txt = readFileSync(path.join(process.cwd(), f), 'utf8').replace(/^﻿/, '');
      const m = txt.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\r\\n]*)["']?\\s*$`, 'm'));
      if (m && m[1]) return m[1];
    } catch {}
  }
  return '';
}
function isAuthorized(req) {
  const pw = process.env.APP_PASSWORD || readFromEnvFiles('APP_PASSWORD');
  if (!pw) return null;
  const a = createHash('sha256').update(String(req.headers['x-app-key'] || '')).digest();
  const b = createHash('sha256').update(pw).digest();
  return timingSafeEqual(a, b);
}

// ---------- GitHub file ----------
const ghUrl = () => `${GH_API}/repos/${GH_REPO}/contents/${GH_PATH.split('/').map(encodeURIComponent).join('/')}`;
const ghHeaders = {
  Authorization: `Bearer ${GH_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'full-feature-plan',
};
async function ghGet() {
  const r = await fetch(`${ghUrl()}?ref=${encodeURIComponent(GH_BRANCH)}`, { headers: ghHeaders, cache: 'no-store' });
  if (r.status === 404) return { data: null, sha: undefined };
  if (!r.ok) throw new Error(`GitHub read failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { data: JSON.parse(Buffer.from(j.content || '', 'base64').toString('utf8') || 'null'), sha: j.sha };
}
async function ghPut(data, retry = true) {
  const { sha } = await ghGet();
  const r = await fetch(ghUrl(), {
    method: 'PUT',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Update savings data ${new Date().toISOString()}`,
      content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
      branch: GH_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if ((r.status === 409 || r.status === 422) && retry) return ghPut(data, false); // sha race → retry once
  if (!r.ok) throw new Error(`GitHub write failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
}

// ---------- local file ----------
async function fileGet() {
  try { return JSON.parse(await fs.readFile(LOCAL_FILE, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function filePut(data) {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(data, null, 2));
}

const readData = async () => (USE_GITHUB ? (await ghGet()).data : fileGet());
const writeData = (d) => (USE_GITHUB ? ghPut(d) : filePut(d));

// ---------- handler ----------
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const auth = isAuthorized(req);
  if (auth === null) return res.status(500).json({ error: 'APP_PASSWORD is not set on the server. On Vercel: Settings → Environment Variables → add APP_PASSWORD (Production), then redeploy.' });
  if (!auth) return res.status(401).json({ error: 'Wrong password' });
  if (process.env.VERCEL && !USE_GITHUB) {
    return res.status(500).json({ error: 'On Vercel the JSON file is kept in a GitHub repo. Add GITHUB_TOKEN and GITHUB_REPO env vars (Production), then redeploy.' });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ data: await readData(), storage: USE_GITHUB ? 'github' : 'file' });
    }
    if (req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      if (!body || typeof body.data !== 'object' || body.data === null || Array.isArray(body.data)) {
        return res.status(400).json({ error: 'Body must be { data: {...} }' });
      }
      const data = { ...body.data, updatedAt: new Date().toISOString() };
      await writeData(data);
      return res.status(200).json({ ok: true, updatedAt: data.updatedAt });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Storage error: ' + e.message });
  }
}
