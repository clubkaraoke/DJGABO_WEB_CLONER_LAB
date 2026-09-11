import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { validatePublicUrl } from './src/security.mjs';

const app = express();
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = process.cwd();
const CAPTURES = path.join(ROOT, 'captures', 'jobs');
const WORKER = path.join(ROOT, 'src', 'worker.mjs');
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS || 120000);
const MAX_CONCURRENT = Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS || 1));
const MAX_QUEUE = Math.max(1, Number(process.env.MAX_QUEUE || 5));
const RATE_LIMIT_PER_HOUR = Math.max(1, Number(process.env.RATE_LIMIT_PER_HOUR || 12));

await fs.mkdir(CAPTURES, { recursive: true });
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html', etag: true, maxAge: '5m' }));

const jobs = new Map();
const queue = [];
const rate = new Map();
let active = 0;

function safeName(value) {
  return String(value || 'analisis').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'analisis';
}

function clientIp(req) {
  return String(req.ip || req.socket.remoteAddress || 'unknown').slice(0, 100);
}

function checkRate(req) {
  const key = clientIp(req);
  const now = Date.now();
  const entry = rate.get(key) || { start: now, count: 0 };
  if (now - entry.start > 3600000) {
    entry.start = now;
    entry.count = 0;

  }
  entry.count += 1;
  rate.set(key, entry);
  return entry.count <= RATE_LIMIT_PER_HOUR;
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    url: job.url,
    name: job.name,
    createdAt: job.createdAt,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    error: job.error || null,
    manifest: job.manifest || null,
    queuePosition: job.status === 'queued' ? Math.max(1, queue.indexOf(job.id) + 1) : null
  };
}

function maybeRunNext() {
  while (active < MAX_CONCURRENT && queue.length) {
    const id = queue.shift();
    const job = jobs.get(id);
    if (!job || job.status !== 'queued') continue;
    runJob(job);
  }
}

function runJob(job) {
  active += 1;
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  const child = spawn(process.execPath, [WORKER, '--url', job.url, '--out', job.outDir], {
    cwd: ROOT,
    env: { ...process.env, HOME: process.env.HOME || '/tmp' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  const timer = setTimeout(() => {
    job.error = `Tiempo máximo excedido (${Math.round(JOB_TIMEOUT_MS / 1000)} s).`;
    child.kill('SIGKILL');
  }, JOB_TIMEOUT_MS);

  child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-200000); });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-120000); });

  child.on('close', async code => {
    clearTimeout(timer);
    active -= 1;
    job.finishedAt = new Date().toISOString();
    if (code === 0) {
      try {
        job.manifest = JSON.parse(await fs.readFile(path.join(job.outDir, 'manifest.json'), 'utf8'));
        job.status = 'completed';
      } catch (error) {
        job.status = 'failed';
        job.error = `El worker terminó, pero no generó un manifest válido: ${error.message}`;
      }
    } else {
      job.status = 'failed';
      job.error ||= (stderr.trim().split('\n').slice(-4).join(' ') || stdout.trim().split('\n').slice(-2).join(' ') || `Worker terminó con código ${code}`).slice(0, 1200);
    }
    maybeRunNext();
  });
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'DJGABO_WEB_CLONER_LAB', version: '0.2.0', active, queued: queue.length });
});

app.post('/api/analyze', async (req, res) => {
  if (!checkRate(req)) return res.status(429).json({ error: 'Límite temporal alcanzado. Intenta más tarde.' });
  if (queue.length >= MAX_QUEUE) return res.status(503).json({ error: 'La cola de análisis está llena.' });

  const rawUrl = String(req.body?.url || '').trim();
  if (!rawUrl || rawUrl.length > 2000) return res.status(400).json({ error: 'Ingresa una URL válida.' });

  try {
    const url = await validatePublicUrl(rawUrl);
    const id = randomUUID();
    const name = safeName(req.body?.name || url.hostname);
    const outDir = path.join(CAPTURES, id);
    await fs.mkdir(outDir, { recursive: true });
    const job = {
      id, name, url: url.href, outDir,
      status: 'queued', createdAt: new Date().toISOString()
    };
    jobs.set(id, job);
    queue.push(id);
    maybeRunNext();
    res.status(202).json(publicJob(job));
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo validar la URL.' });
  }
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Análisis no encontrado o expirado.' });
  res.json(publicJob(job));
});

app.get('/api/jobs/:id/report', async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Análisis no encontrado.' });
  if (job.status !== 'completed') return res.status(409).json({ error: 'El análisis todavía no terminó.' });
  try {
    const [report, network, diagnostics] = await Promise.all([
      fs.readFile(path.join(job.outDir, 'report.json'), 'utf8').then(JSON.parse),
      fs.readFile(path.join(job.outDir, 'network.json'), 'utf8').then(JSON.parse),
      fs.readFile(path.join(job.outDir, 'diagnostics.json'), 'utf8').then(JSON.parse)
    ]);
    res.json({ manifest: job.manifest, report, network, diagnostics });
  } catch (error) {
    res.status(500).json({ error: `No se pudo leer el reporte: ${error.message}` });
  }
});

app.get('/api/jobs/:id/screenshot/:name', async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();
  const allowed = new Set(['desktop', 'tablet', 'mobile']);
  if (!allowed.has(req.params.name)) return res.status(404).end();
  const file = path.join(job.outDir, 'screenshots', `${req.params.name}.png`);
  try {
    await fs.access(file);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(file);
  } catch {
    res.status(404).end();
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use((_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.listen(PORT, HOST, () => {
  console.log(`DJGABO WEB CLONER LAB V0.2 escuchando en http://${HOST}:${PORT}`);
});
