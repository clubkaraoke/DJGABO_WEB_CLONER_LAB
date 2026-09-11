import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { validatePublicUrl, isSafeBrowserScheme } from './security.mjs';

function argsOf(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    out[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

function cleanText(value, max = 300) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const args = argsOf(process.argv);
if (!args.url || !args.out) throw new Error('Faltan --url y/o --out.');

const dnsCache = new Map();
const requestedUrl = await validatePublicUrl(args.url, dnsCache);
const outDir = path.resolve(args.out);
const screenshotsDir = path.join(outDir, 'screenshots');
await fs.mkdir(screenshotsDir, { recursive: true });

const blockedRequests = [];
const network = [];
const consoleMessages = [];
const pageErrors = [];
const startedAt = new Date().toISOString();
let browser;

try {
  browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-first-run']
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
    ignoreHTTPSErrors: false,
    locale: 'es-PE'
  });

  await context.route('**/*', async route => {
    const request = route.request();
    const raw = request.url();
    if (!isSafeBrowserScheme(raw)) {
      blockedRequests.push({ url: raw.slice(0, 1000), reason: 'scheme' });
      return route.abort('blockedbyclient');
    }
    let parsed;
    try { parsed = new URL(raw); } catch { return route.abort('blockedbyclient'); }
    if (['data:', 'blob:'].includes(parsed.protocol)) return route.continue();
    try {
      await validatePublicUrl(raw, dnsCache);
      return route.continue();
    } catch (error) {
      blockedRequests.push({ url: raw.slice(0, 1000), reason: cleanText(error.message, 160) });
      return route.abort('blockedbyclient');
    }
  });

  const page = await context.newPage();
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: cleanText(msg.text(), 1000) }));
  page.on('pageerror', error => pageErrors.push(cleanText(error.message || error, 1000)));
  page.on('response', response => {
    const request = response.request();
    let hostname = null;
    try { hostname = new URL(response.url()).hostname; } catch {}
    network.push({
      method: request.method(),
      resourceType: request.resourceType(),
      status: response.status(),
      hostname,
      url: response.url().slice(0, 1400)
    });
  });

  try {
    await page.goto(requestedUrl.href, { waitUntil: 'networkidle', timeout: 45000 });
  } catch {
    await page.goto(requestedUrl.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
  }

  await validatePublicUrl(page.url(), dnsCache);

  const viewports = [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'tablet', width: 834, height: 1112 },
    { name: 'mobile', width: 390, height: 844 }
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(screenshotsDir, `${viewport.name}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  const report = await page.evaluate(() => {
    const text = (el, max = 300) => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, max);
    const abs = value => {
      if (!value) return null;
      try { return new URL(value, location.href).href; } catch { return null; }
    };
    const visible = el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const style = el => {
      const s = getComputedStyle(el);
      return {
        display: s.display, position: s.position, color: s.color,
        backgroundColor: s.backgroundColor, fontFamily: s.fontFamily,
        fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight,
        borderRadius: s.borderRadius, boxShadow: s.boxShadow,
        padding: s.padding, margin: s.margin, gap: s.gap,
        opacity: s.opacity, transform: s.transform,
        transition: s.transition, animation: s.animation
      };
    };
    const rect = el => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    };

    const controls = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="switch"],summary')]
      .filter(visible).slice(0, 700).map((el, index) => ({
        index,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        text: text(el, 220),
        href: el.tagName === 'A' ? abs(el.getAttribute('href')) : null,
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        ariaLabel: el.getAttribute('aria-label'),
        ariaExpanded: el.getAttribute('aria-expanded'),
        ariaSelected: el.getAttribute('aria-selected'),
        disabled: Boolean(el.disabled),
        rect: rect(el)
      }));

    const visibleElements = [...document.querySelectorAll('header,nav,main,section,article,aside,footer,form,[class]')]
      .filter(visible).slice(0, 350).map((el, index) => ({
        index, tag: el.tagName.toLowerCase(), id: el.id || null,
        className: typeof el.className === 'string' ? el.className.slice(0, 260) : null,
        text: text(el, 180), rect: rect(el), style: style(el)
      }));

    const scripts = [...document.scripts].map(el => el.src || '').filter(Boolean);
    const bodyText = document.body?.innerText || '';
    const frameworkHints = {
      react: Boolean(document.querySelector('[data-reactroot],#__next')) || scripts.some(s => /react|next/i.test(s)),
      vue: Boolean(document.querySelector('[data-v-app],#__nuxt')) || scripts.some(s => /vue|nuxt/i.test(s)),
      angular: Boolean(document.querySelector('[ng-version]')) || scripts.some(s => /angular/i.test(s)),
      webflow: Boolean(document.documentElement.getAttribute('data-wf-page')),
      cloudflareChallenge: /just a moment|verifying you are human|challenges\.cloudflare/i.test(document.title + ' ' + bodyText)
    };

    return {
      finalUrl: location.href,
      title: document.title,
      lang: document.documentElement.lang || null,
      viewport: { width: innerWidth, height: innerHeight },
      headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].slice(0, 250).map(el => ({ level: Number(el.tagName.slice(1)), text: text(el) })),
      controls,
      forms: [...document.forms].slice(0, 100).map(form => ({
        action: abs(form.getAttribute('action') || location.href),
        method: (form.getAttribute('method') || 'get').toLowerCase(),
        controls: [...form.elements].slice(0, 120).map(el => ({
          tag: el.tagName.toLowerCase(), type: el.getAttribute('type'), name: el.getAttribute('name'),
          id: el.id || null, placeholder: el.getAttribute('placeholder'), autocomplete: el.getAttribute('autocomplete')
        }))
      })),
      images: [...document.images].slice(0, 1000).map(img => ({ src: abs(img.currentSrc || img.src), alt: img.alt || null, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height })),
      stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map(el => abs(el.href)).filter(Boolean),
      scripts: scripts.slice(0, 600),
      visibleElements,
      frameworkHints
    };
  });

  const html = await page.content();
  const redactedNetwork = network.slice(0, 5000);
  const manifest = {
    schemaVersion: 2,
    engine: 'DJGABO_WEB_CLONER_LAB',
    engineVersion: '0.2.0',
    startedAt,
    finishedAt: new Date().toISOString(),
    requestedUrl: requestedUrl.href,
    finalUrl: report.finalUrl,
    title: report.title,
    counts: {
      controls: report.controls.length,
      forms: report.forms.length,
      images: report.images.length,
      elements: report.visibleElements.length,
      network: redactedNetwork.length,
      blockedRequests: blockedRequests.length,
      consoleMessages: consoleMessages.length,
      pageErrors: pageErrors.length
    },
    frameworkHints: report.frameworkHints,
    screenshots: ['desktop', 'tablet', 'mobile'].map(name => `screenshots/${name}.png`),
    privacy: 'No cookies, localStorage, form values, authorization headers or response bodies are stored.'
  };

  await fs.writeFile(path.join(outDir, 'page.html'), html, 'utf8');
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, 'network.json'), JSON.stringify(redactedNetwork, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, 'diagnostics.json'), JSON.stringify({ consoleMessages: consoleMessages.slice(0, 500), pageErrors: pageErrors.slice(0, 100), blockedRequests: blockedRequests.slice(0, 500) }, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  await context.close();
  console.log(JSON.stringify({ ok: true, manifest }));
} finally {
  if (browser) await browser.close().catch(() => {});
}
