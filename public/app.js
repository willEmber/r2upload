// Simple config persisted in localStorage
const defaults = {
  apiBase: '', // same origin
  publicBaseOverride: '',
  defaultPrefix: '',
  defaultStrategy: 'hash',
  theme: 'system', // light | dark | system
};

const $ = (id) => document.getElementById(id);

function loadCfg() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('r2cfg') || '{}') }; } catch { return { ...defaults }; }
}
function saveCfg(cfg) { localStorage.setItem('r2cfg', JSON.stringify(cfg)); }

let CFG = loadCfg();
applyTheme(CFG.theme);

// Health status monitoring
let healthCheckInterval;

function updateHealthStatus(status, text, icon) {
  const healthElement = $('healthStatus');
  const iconElement = healthElement.querySelector('.health-icon');
  const textElement = healthElement.querySelector('.health-text');

  // Remove all status classes
  healthElement.classList.remove('healthy', 'unhealthy', 'checking');

  // Add new status class
  healthElement.classList.add(status);

  // Update content
  iconElement.textContent = icon;
  textElement.textContent = text;
}

async function checkHealth() {
  updateHealthStatus('checking', 'Checking...', '⚡');

  try {
    const response = await fetch(apiUrl('/api/health'), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        updateHealthStatus('healthy', 'Healthy', '✅');
      } else {
        updateHealthStatus('unhealthy', 'Unhealthy', '❌');
      }
    } else {
      updateHealthStatus('unhealthy', `Error ${response.status}`, '❌');
    }
  } catch (error) {
    updateHealthStatus('unhealthy', 'Offline', '❌');
  }
}

function startHealthMonitoring() {
  // Check immediately
  checkHealth();

  // Then check every 30 seconds
  if (healthCheckInterval) clearInterval(healthCheckInterval);
  healthCheckInterval = setInterval(checkHealth, 30000);
}

function stopHealthMonitoring() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// Add click handler for health status
document.addEventListener('DOMContentLoaded', () => {
  $('healthStatus').addEventListener('click', () => {
    checkHealth();
  });
});

// Start monitoring when page loads
startHealthMonitoring();

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

function toast(msg, ms = 1800) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

function apiUrl(p) { return (CFG.apiBase || '') + p; }

// Settings dialog
$('btnSettings').addEventListener('click', () => {
  $('cfgApiBase').value = CFG.apiBase;
  $('cfgPublicBase').value = CFG.publicBaseOverride;
  $('cfgDefaultPrefix').value = CFG.defaultPrefix;
  $('cfgDefaultStrategy').value = CFG.defaultStrategy;
  $('cfgTheme').value = CFG.theme;
  $('settingsDialog').showModal();
});

$('btnSaveSettings').addEventListener('click', (e) => {
  e.preventDefault();
  CFG = {
    apiBase: $('cfgApiBase').value.trim(),
    publicBaseOverride: $('cfgPublicBase').value.trim().replace(/\/$/, ''),
    defaultPrefix: $('cfgDefaultPrefix').value.trim().replace(/\/$/, ''),
    defaultStrategy: $('cfgDefaultStrategy').value,
    theme: $('cfgTheme').value,
  };
  saveCfg(CFG);
  applyTheme(CFG.theme);
  $('settingsDialog').close();
  // apply defaults to form
  if (!$('prefix').value) $('prefix').value = CFG.defaultPrefix;
  $('strategy').value = CFG.defaultStrategy;
  toast('Settings saved');
});

// Initialize form defaults
if (CFG.defaultPrefix) $('prefix').value = CFG.defaultPrefix;
$('strategy').value = CFG.defaultStrategy;

// Queue state for multi-upload with previews
let queue = []; // {id, file, url, status, progress, key, publicUrl, error}
let seq = 1;

const drop = $('dropZone');
const fileInput = $('file');
$('btnChoose').addEventListener('click', () => fileInput.click());

drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', (e) => {
  e.preventDefault(); drop.classList.remove('drag');
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => { if (fileInput.files?.length) addFiles(fileInput.files); fileInput.value = ''; });

$('btnClear').addEventListener('click', () => { clearQueue(); renderQueue(); updateOverallProgress(); });

function addFiles(files) {
  const arr = Array.from(files);
  arr.forEach((file) => {
    const isImg = file.type?.startsWith('image/');
    const url = isImg ? URL.createObjectURL(file) : '';
    queue.push({ id: seq++, file, url, status: 'queued', progress: 0, key: '', publicUrl: '', error: '' });
  });
  renderQueue();
}

function clearQueue() {
  queue.forEach((it) => { if (it.url) URL.revokeObjectURL(it.url); });
  queue = [];
}

function fmtBytes(n) {
  if (!n && n !== 0) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i ? 1 : 0)} ${u[i]}`;
}

function renderQueue() {
  const grid = $('previewGrid');
  if (!queue.length) { grid.innerHTML = '<div class="muted small">No files selected</div>'; return; }
  grid.innerHTML = queue.map((it) => {
    const isImg = it.file.type?.startsWith('image/');
    const name = escapeHtml(it.file.name);
    const size = fmtBytes(it.file.size);
    const badge = it.status === 'done' ? '<span class="badge ok">done</span>' : it.status === 'error' ? `<span class="badge err" title="${escapeHtml(it.error)}">error</span>` : `<span class="badge">${escapeHtml(it.status)}</span>`;
    const link = it.publicUrl ? `<a href="${it.publicUrl}" target="_blank" rel="noreferrer">open</a>` : '';
    return `
      <div class="preview-item" data-id="${it.id}">
        <div class="thumb">
          ${isImg && it.url ? `<img src="${it.url}" alt="${name}" />` : `<div class="muted">${name.split('.').pop()?.toUpperCase() || 'FILE'}</div>`}
          <button class="remove" data-remove="${it.id}">×</button>
        </div>
        <div class="meta">
          <div class="name" title="${name}">${name}</div>
          <div class="muted">${size} ${badge} ${link ? ' • ' + link : ''}</div>
          <progress value="${it.progress}" max="100"></progress>
        </div>
      </div>
    `;
  }).join('');
  grid.querySelectorAll('[data-remove]')?.forEach((btn) => btn.addEventListener('click', () => removeFromQueue(Number(btn.getAttribute('data-remove')))));
}

function removeFromQueue(id) {
  const idx = queue.findIndex((x) => x.id === id);
  if (idx >= 0) {
    const it = queue[idx];
    if (it.status === 'uploading') { alert('Cannot remove while uploading'); return; }
    if (it.url) URL.revokeObjectURL(it.url);
    queue.splice(idx, 1);
    renderQueue();
    updateOverallProgress();
  }
}

function updateOverallProgress() {
  if (!queue.length) { $('overallProgress').value = 0; return; }
  const sum = queue.reduce((acc, it) => acc + (it.status === 'done' ? 100 : it.progress || 0), 0);
  $('overallProgress').value = Math.floor(sum / queue.length);
}

$('btnUploadAll').addEventListener('click', async () => {
  const items = queue.filter((it) => it.status === 'queued' || it.status === 'error');
  if (!items.length) { alert('No files to upload'); return; }
  let prefix = $('prefix').value.trim() || CFG.defaultPrefix;
  const strategy = $('strategy').value || CFG.defaultStrategy;
  if (prefix) prefix = prefix.replace(/\/$/, '');

  disableUploadUI(true);
  try {
    for (const it of items) {
      it.status = 'uploading'; it.progress = 0; renderQueue(); updateOverallProgress();
      try {
        const body = { filename: it.file.name, contentType: it.file.type || 'application/octet-stream', prefix, strategy };
        const signRes = await fetch(apiUrl('/api/sign-upload'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
        if (!signRes.url) throw new Error(signRes.error || 'No signed URL');
        await uploadWithProgress(signRes.url, it.file, it.file.type || 'application/octet-stream', (p) => { it.progress = p; updateItemProgress(it.id, p); });
        it.key = signRes.key;
        it.publicUrl = signRes.publicUrl || (CFG.publicBaseOverride ? `${CFG.publicBaseOverride}/${signRes.key}` : '');
        it.status = 'done'; it.progress = 100; renderQueue(); updateOverallProgress();
      } catch (e) {
        it.status = 'error'; it.error = e?.message || String(e); renderQueue(); updateOverallProgress();
      }
    }
    toast('All uploads complete');
  } finally {
    disableUploadUI(false);
  }
});

function disableUploadUI(disabled) {
  $('btnUploadAll').disabled = disabled;
  $('btnChoose').disabled = disabled;
  $('btnClear').disabled = disabled;
}

function updateItemProgress(id, p) {
  const el = document.querySelector(`.preview-item[data-id="${id}"] progress`);
  if (el) el.value = p;
}

async function uploadWithProgress(url, file, contentType, onProgress) {
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) { const p = (e.loaded / e.total) * 100; if (onProgress) onProgress(p); } });
    xhr.onreadystatechange = () => { if (xhr.readyState === 4) { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error('HTTP ' + xhr.status)); } };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(file);
  });
}

// List + pagination
let page = 1;
let tokenStack = ['']; // track tokens for Prev
let nextToken = null;

$('btnList').addEventListener('click', () => refreshList(true));
$('btnNext').addEventListener('click', () => { if (nextToken) { tokenStack.push(nextToken); page++; refreshList(false); } });
$('btnPrev').addEventListener('click', () => { if (tokenStack.length > 1) { tokenStack.pop(); page = Math.max(1, page - 1); refreshList(false); } });

async function refreshList(reset) {
  if (reset) { page = 1; tokenStack = ['']; nextToken = null; }
  const prefix = $('listPrefix').value.trim();
  const params = new URLSearchParams();
  if (prefix) params.set('prefix', prefix);
  const t = tokenStack[tokenStack.length - 1];
  if (t) params.set('continuationToken', t);
  const url = apiUrl('/api/objects' + (params.toString() ? `?${params}` : ''));
  const res = await fetch(url).then(r => r.json());

  // Build table
  const rows = (res.contents || []).map((o) => {
    const k = o.key || '';
    const pub = composePublicUrl(k);
    return `
      <tr>
        <td><input type="checkbox" data-key="${escapeHtml(k)}" /></td>
        <td><code>${escapeHtml(k)}</code></td>
        <td>${o.size ?? ''}</td>
        <td>${o.lastModified ? new Date(o.lastModified).toLocaleString() : ''}</td>
        <td>
          ${pub ? `<a href="${pub}" target="_blank" rel="noreferrer">🔗 open</a> <button class="btn" data-copy="${pub}">📋 Copy</button>` : '<span class="muted">🚫 No public URL</span>'}
          <button class="btn danger" data-del="${escapeHtml(k)}">🗑️ Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  $('listResult').innerHTML = `
    <table>
      <thead>
        <tr>
          <th><input type="checkbox" id="chkAll"/></th>
          <th>Key</th>
          <th>Size</th>
          <th>Modified</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  bindCopyButtons($('listResult'));
  bindDeleteButtons($('listResult'));
  bindSelectionControls();

  nextToken = res.nextContinuationToken;
  $('btnNext').disabled = !nextToken;
  $('btnPrev').disabled = tokenStack.length <= 1;
  $('pageInfo').textContent = `Page ${page}${res.keyCount ? ` • ${res.keyCount} items` : ''}`;
}

function composePublicUrl(key) {
  if (CFG.publicBaseOverride) return `${CFG.publicBaseOverride}/${key}`;
  return '';
}

function bindCopyButtons(scope) {
  scope.querySelectorAll('button[data-copy]')?.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const val = btn.getAttribute('data-copy');
      if (!val) return;
      await navigator.clipboard.writeText(val);
      toast('Copied');
    });
  });
}

function bindDeleteButtons(scope) {
  scope.querySelectorAll('button[data-del]')?.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-del');
      if (!key) return;
      if (!confirm(`Delete:\n${key}?`)) return;
      await delKey(key);
      toast('Deleted');
      refreshList(false);
    });
  });
}

async function delKey(key) {
  const url = apiUrl('/api/objects/' + encodeURIComponent(key));
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
}

function bindSelectionControls() {
  const chkAll = $('chkAll');
  const btnDeleteSelected = $('btnDeleteSelected');
  const updateState = () => {
    const boxes = [...document.querySelectorAll('tbody input[type="checkbox"][data-key]')];
    const any = boxes.some(b => b.checked);
    btnDeleteSelected.disabled = !any;
    if (chkAll) chkAll.checked = boxes.every(b => b.checked);
  };
  document.querySelectorAll('tbody input[type="checkbox"][data-key]')?.forEach((b) => b.addEventListener('change', updateState));
  if (chkAll) chkAll.addEventListener('change', () => {
    const boxes = document.querySelectorAll('tbody input[type="checkbox"][data-key]');
    boxes.forEach((b) => { b.checked = chkAll.checked; });
    updateState();
  });
  btnDeleteSelected.onclick = async () => {
    const keys = [...document.querySelectorAll('tbody input[type="checkbox"][data-key]')].filter(b => b.checked).map(b => b.getAttribute('data-key')).filter(Boolean);
    if (!keys.length) return;
    if (!confirm(`Delete ${keys.length} objects?`)) return;
    // Use batch API
    const url = apiUrl('/api/objects/batch');
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', keys }) });
    if (!res.ok) { alert('Batch delete failed'); return; }
    toast('Batch deleted');
    refreshList(false);
  };
  updateState();
}

// Helpers
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Initial list on load
refreshList(true).catch(() => { });
