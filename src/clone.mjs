import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === 'headful') {
      args.headful = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Falta valor para --${key}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function safeSlug(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'site';
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

const args = parseArgs(process.argv);
if (!args.url) {
  console.error('Uso: npm run clone -- --url https://example.com --name ejemplo [--headful]');
  process.exit(1);
}

let targetUrl;
try {
  targetUrl = new URL(args.url);
} catch {
  console.error(`URL invalida: ${args.url}`);
  process.exit(1);
}

if (!['http:', 'https:'].includes(targetUrl.protocol)) {
  console.error('Solo se permiten URLs http/https.');
  process.exit(1);
}

const projectName = safeSlug(args.name || targetUrl.hostname);
const runId = stamp();
const outDir = path.resolve('captures', projectName, runId);
const screenshotsDir = path.join(outDir, 'screenshots');
await ensureDir(screenshotsDir);

const browser = await chromium.launch({ headless: !args.headful });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: 'block',
  recordHar: {
    path: path.join(outDir, 'network.har'),
    content: 'embed',
    mode: 'full'
  }
});

const page = await context.newPage();
const consoleMessages = [];
const pageErrors = [];

page.on('console', msg => {
  consoleMessages.push({ type: msg.type(), text: msg.text() });
});
page.on('pageerror', error => {
  pageErrors.push(String(error));
});

async function gotoTarget() {
  try {
    await page.goto(targetUrl.href, { waitUntil: 'networkidle', timeout: 45000 });
  } catch {
    await page.goto(targetUrl.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
  }
}

await gotoTarget();

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 }
];

for (const viewport of viewports) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(screenshotsDir, `${viewport.name}.png`),
    fullPage: true
  });
}

await page.setViewportSize({ width: 1440, height: 1000 });
await page.waitForTimeout(300);

const html = await page.content();
await fs.writeFile(path.join(outDir, 'page.html'), html, 'utf8');

const pageData = await page.evaluate(() => {
  const text = el => (el?.innerText || el?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 500);
  const abs = value => {
    if (!value) return null;
    try { return new URL(value, location.href).href; } catch { return value; }
  };
  const rect = el => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x), y: Math.round(r.y),
      width: Math.round(r.width), height: Math.round(r.height)
    };
  };
  const styleSubset = el => {
    const s = getComputedStyle(el);
    return {
      display: s.display,
      position: s.position,
      color: s.color,
      backgroundColor: s.backgroundColor,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      borderRadius: s.borderRadius,
      boxShadow: s.boxShadow,
      padding: s.padding,
      margin: s.margin,
      gap: s.gap,
      opacity: s.opacity,
      transform: s.transform,
      transition: s.transition,
      animation: s.animation
    };
  };

  const visibleElements = [...document.querySelectorAll('header,nav,main,section,article,aside,footer,button,a,input,select,textarea,[role="button"],[class]')]
    .filter(el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    })
    .slice(0, 250)
    .map((el, index) => ({
      index,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: typeof el.className === 'string' ? el.className.slice(0, 300) : null,
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      text: text(el).slice(0, 200),
      rect: rect(el),
      style: styleSubset(el)
    }));

  return {
    capturedUrl: location.href,
    title: document.title,
    lang: document.documentElement.lang || null,
    meta: [...document.querySelectorAll('meta')].map(el => ({
      name: el.getAttribute('name'),
      property: el.getAttribute('property'),
      content: el.getAttribute('content')
    })).filter(x => x.name || x.property),
    links: [...document.querySelectorAll('a[href]')].slice(0, 1000).map(el => ({
      text: text(el).slice(0, 250),
      href: abs(el.getAttribute('href')),
      target: el.getAttribute('target'),
      rel: el.getAttribute('rel')
    })),
    buttons: [...document.querySelectorAll('button,[role="button"]')].slice(0, 500).map(el => ({
      text: text(el).slice(0, 250),
      type: el.getAttribute('type'),
      ariaLabel: el.getAttribute('aria-label'),
      disabled: Boolean(el.disabled)
    })),
    forms: [...document.forms].slice(0, 100).map(form => ({
      action: abs(form.getAttribute('action') || location.href),
      method: (form.getAttribute('method') || 'get').toLowerCase(),
      controls: [...form.elements].slice(0, 100).map(el => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        id: el.id || null,
        placeholder: el.getAttribute('placeholder'),
        autocomplete: el.getAttribute('autocomplete')
      }))
    })),
    images: [...document.images].slice(0, 1000).map(img => ({
      src: abs(img.currentSrc || img.src),
      alt: img.alt || null,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      loading: img.loading || null
    })),
    stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map(el => abs(el.href)),
    scripts: [...document.scripts].map(el => ({
      src: abs(el.src),
      type: el.type || null,
      inline: !el.src
    })),
    headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].slice(0, 300).map(el => ({
      level: Number(el.tagName.slice(1)),
      text: text(el).slice(0, 300)
    })),
    visibleElements
  };
});

const sameOriginLinks = [...new Set(
  pageData.links
    .map(item => item.href)
    .filter(Boolean)
    .filter(href => {
      try { return new URL(href).origin === targetUrl.origin; } catch { return false; }
    })
    .map(href => {
      const u = new URL(href);
      u.hash = '';
      return u.href;
    })
)].slice(0, 500);

const manifest = {
  schemaVersion: 1,
  engine: 'DJGABO_WEB_CLONER_LAB',
  engineVersion: '0.1.0',
  createdAt: new Date().toISOString(),
  requestedUrl: targetUrl.href,
  finalUrl: page.url(),
  projectName,
  files: {
    html: 'page.html',
    data: 'page-data.json',
    har: 'network.har',
    screenshots: viewports.map(v => `screenshots/${v.name}.png`)
  },
  counts: {
    links: pageData.links.length,
    sameOriginLinks: sameOriginLinks.length,
    buttons: pageData.buttons.length,
    forms: pageData.forms.length,
    images: pageData.images.length,
    visibleElements: pageData.visibleElements.length,
    consoleMessages: consoleMessages.length,
    pageErrors: pageErrors.length
  },
  sameOriginLinks,
  consoleMessages: consoleMessages.slice(0, 500),
  pageErrors: pageErrors.slice(0, 100),
  note: 'Captura de superficie publica observable. No contiene intencionalmente cookies, localStorage ni valores de formularios.'
};

await fs.writeFile(path.join(outDir, 'page-data.json'), JSON.stringify(pageData, null, 2), 'utf8');
await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

await context.close();
await browser.close();

console.log('\nDJGABO WEB CLONER LAB');
console.log(`Captura completada: ${manifest.finalUrl}`);
console.log(`Salida: ${outDir}`);
console.log(`Links internos detectados: ${sameOriginLinks.length}`);
console.log(`Botones detectados: ${pageData.buttons.length}`);
console.log(`Formularios detectados: ${pageData.forms.length}`);
