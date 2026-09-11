const $ = selector => document.querySelector(selector);
const form = $('#analyzeForm');
const urlInput = $('#url');
const btn = $('#analyzeBtn');
const jobPanel = $('#jobPanel');
const jobTitle = $('#jobTitle');
const jobUrl = $('#jobUrl');
const jobState = $('#jobState');
const progressBar = $('#progressBar');
const jobNote = $('#jobNote');
const results = $('#results');
const errorPanel = $('#errorPanel');
const errorText = $('#errorText');
const serviceStatus = $('#serviceStatus');
let currentJob = null;
let currentReport = null;
let pollTimer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[ch]));
}

async function api(url, options) {
  const response = await fetch(url, options);
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

async function health() {
  try {
    const info = await api('/health');
    serviceStatus.classList.add('ok');
    serviceStatus.innerHTML = `<i></i> Motor online · ${info.active} activo · ${info.queued} en cola`;
  } catch {
    serviceStatus.classList.remove('ok');
    serviceStatus.innerHTML = '<i></i> Motor sin conexión';
  }
}

function setJobState(job) {
  jobPanel.classList.remove('hidden');
  errorPanel.classList.add('hidden');
  jobUrl.textContent = job.url || '';
  if (job.status === 'queued') {
    jobTitle.textContent = 'Esperando turno de Chromium';
    jobState.textContent = 'EN COLA';
    progressBar.style.width = '15%';
    jobNote.textContent = job.queuePosition ? `Posición ${job.queuePosition} en la cola.` : 'Preparando proceso aislado.';
  } else if (job.status === 'running') {
    jobTitle.textContent = 'Analizando interfaz y red pública';
    jobState.textContent = 'ANALIZANDO';
    progressBar.style.width = '68%';
    jobNote.textContent = 'Capturando desktop, tablet, mobile, controles, estilos y requests observables.';
  } else if (job.status === 'completed') {
    jobTitle.textContent = job.manifest?.title || 'Análisis completado';
    jobState.textContent = 'LISTO';
    progressBar.style.width = '100%';
    jobNote.textContent = job.manifest?.frameworkHints?.cloudflareChallenge
      ? 'Se detectó una pantalla de desafío Cloudflare. La captura puede corresponder al challenge y no a la aplicación final.'
      : 'Captura terminada. Puedes revisar el mapa de la interfaz.';
  }
}

function renderReport(data, id) {
  currentReport = data;
  const m = data.manifest || {};
  const r = data.report || {};
  const counts = m.counts || {};
  $('#metrics').innerHTML = [
    ['Controles', counts.controls || 0],
    ['Elementos', counts.elements || 0],
    ['Imágenes', counts.images || 0],
    ['Requests', counts.network || 0],
    ['Errores', counts.pageErrors || 0]
  ].map(([label, value]) => `<div class="metric"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join('');

  $('#frameUrl').textContent = m.finalUrl || m.requestedUrl || '';
  const shot = $('#screenshot');
  shot.src = `/api/jobs/${encodeURIComponent(id)}/screenshot/desktop?t=${Date.now()}`;
  shot.dataset.job = id;
  $('#controlCount').textContent = `${(r.controls || []).length} detectados`;
  $('#controlsBody').innerHTML = (r.controls || []).slice(0, 120).map(control => {
    const label = control.text || control.ariaLabel || control.name || control.href || '(sin texto)';
    const state = control.disabled ? 'deshabilitado' : control.ariaSelected === 'true' ? 'seleccionado' : control.ariaExpanded === 'true' ? 'abierto' : 'visible';
    return `<tr><td>${esc(control.role || control.tag || 'control')}</td><td>${esc(label)}</td><td>${esc(state)}</td></tr>`;
  }).join('') || '<tr><td colspan="3">No se detectaron controles visibles.</td></tr>';

  const hints = r.frameworkHints || {};
  $('#techList').innerHTML = Object.entries({ React:hints.react, Vue:hints.vue, Angular:hints.angular, Webflow:hints.webflow, 'Cloudflare challenge':hints.cloudflareChallenge })
    .map(([name, on]) => `<div class="tech ${on ? 'on' : ''}"><b>${esc(name)}</b><span>${on ? 'DETECTADO' : '—'}</span></div>`).join('');

  const hostCounts = new Map();
  for (const item of data.network || []) {
    if (!item.hostname) continue;
    hostCounts.set(item.hostname, (hostCounts.get(item.hostname) || 0) + 1);
  }
  $('#hosts').innerHTML = [...hostCounts.entries()].sort((a,b) => b[1] - a[1]).slice(0, 24)
    .map(([host, count]) => `<span>${esc(host)} · ${count}</span>`).join('') || '<span>Sin hosts registrados</span>';

  $('#headings').innerHTML = (r.headings || []).slice(0, 120).map(h => `<div class="heading-row level-${h.level}"><b>H${h.level}</b><span>${esc(h.text || '(vacío)')}</span></div>`).join('') || '<div class="heading-row"><span>No se encontraron encabezados.</span></div>';
  results.classList.remove('hidden');
}

async function poll(id) {
  try {
    const job = await api(`/api/jobs/${encodeURIComponent(id)}`);
    currentJob = job;
    setJobState(job);
    await health();
    if (job.status === 'completed') {
      btn.disabled = false;
      const data = await api(`/api/jobs/${encodeURIComponent(id)}/report`);
      renderReport(data, id);
      return;
    }
    if (job.status === 'failed') {
      btn.disabled = false;
      errorText.textContent = job.error || 'Error desconocido.';
      errorPanel.classList.remove('hidden');
      return;
    }
    pollTimer = setTimeout(() => poll(id), 1800);
  } catch (error) {
    btn.disabled = false;
    errorText.textContent = error.message;
    errorPanel.classList.remove('hidden');
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  clearTimeout(pollTimer);
  results.classList.add('hidden');
  errorPanel.classList.add('hidden');
  btn.disabled = true;
  jobPanel.classList.remove('hidden');
  jobTitle.textContent = 'Validando URL';
  jobUrl.textContent = urlInput.value.trim();
  jobState.textContent = 'PREPARANDO';
  progressBar.style.width = '7%';
  jobNote.textContent = 'Comprobando que el destino sea público y seguro para el VPS.';
  try {
    const job = await api('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlInput.value.trim() })
    });
    currentJob = job;
    setJobState(job);
    poll(job.id);
  } catch (error) {
    btn.disabled = false;
    errorText.textContent = error.message;
    errorPanel.classList.remove('hidden');
  }
});

$('#shotTabs').addEventListener('click', event => {
  const button = event.target.closest('button[data-shot]');
  if (!button || !currentJob) return;
  document.querySelectorAll('#shotTabs button').forEach(el => el.classList.remove('active'));
  button.classList.add('active');
  $('#screenshot').src = `/api/jobs/${encodeURIComponent(currentJob.id)}/screenshot/${button.dataset.shot}?t=${Date.now()}`;
});

urlInput.value = 'https://nextgen.uvronline.app/es/#advanced';
health();
setInterval(health, 15000);
