// Simple config persisted in localStorage
const defaults = {
  apiBase: 'http://localhost:3000', // default to local server for desktop app
  publicBaseOverride: '',
  defaultPrefix: '',
  defaultStrategy: 'hash',
  theme: 'system', // light | dark | system
  // R2 Credentials (for desktop app)
  r2Endpoint: '',
  r2AccessKey: '',
  r2SecretKey: '',
  r2Bucket: '',
};

const $ = (id) => document.getElementById(id);

function loadCfg() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('r2cfg') || '{}') }; } catch { return { ...defaults }; }
}
function saveCfg(cfg) { localStorage.setItem('r2cfg', JSON.stringify(cfg)); }

let CFG = loadCfg();
applyTheme(CFG.theme);

// Health status monitoring (manual only)
function updateHealthStatus(status, text, icon) {
  const healthElement = $('healthStatus');
  const iconElement = healthElement.querySelector('.health-icon');
  const textElement = healthElement.querySelector('.health-text');

  // Remove all status classes
  healthElement.classList.remove('healthy', 'unhealthy', 'checking');

  // Add new status class
  healthElement.classList.add(status);

  // Update content - use SVG icons
  const icons = {
    checking: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>',
    healthy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    unhealthy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
  };
  iconElement.innerHTML = icons[status] || icons.checking;
  textElement.textContent = text;
}

async function checkHealth() {
  updateHealthStatus('checking', '检查中...', '');

  try {
    const response = await fetch(apiUrl('/api/health'), {
      method: 'GET',
      headers: { 'Accept': 'application/json', ...getR2Headers() }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        updateHealthStatus('healthy', '正常', '');
      } else {
        updateHealthStatus('unhealthy', '异常', '');
      }
    } else {
      updateHealthStatus('unhealthy', `错误 ${response.status}`, '');
    }
  } catch (error) {
    updateHealthStatus('unhealthy', '离线', '');
  }
}

// Add click handler for manual health check
document.addEventListener('DOMContentLoaded', () => {
  $('healthStatus').addEventListener('click', () => {
    checkHealth();
  });
  // Check on page load
  checkHealth();
});

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove('dark-mode');
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
    root.classList.add('dark-mode');
  } else {
    root.removeAttribute('data-theme');
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark-mode');
    }
  }
}

function toast(msg, ms = 2000) {
  const t = $('toast');
  const msgEl = t.querySelector('.toast-message');
  if (msgEl) {
    msgEl.textContent = msg;
  } else {
    t.textContent = msg;
  }
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

function apiUrl(p) { return (CFG.apiBase || '') + p; }

// Get R2 headers for API requests (desktop app)
function getR2Headers() {
  const headers = {};
  if (CFG.r2Endpoint) headers['X-R2-Endpoint'] = CFG.r2Endpoint;
  if (CFG.r2AccessKey) headers['X-R2-Access-Key'] = CFG.r2AccessKey;
  if (CFG.r2SecretKey) headers['X-R2-Secret-Key'] = CFG.r2SecretKey;
  if (CFG.r2Bucket) headers['X-R2-Bucket'] = CFG.r2Bucket;
  if (CFG.publicBaseOverride) headers['X-R2-Public-Url'] = CFG.publicBaseOverride;
  return headers;
}

// Settings dialog
$('btnSettings').addEventListener('click', () => {
  $('cfgApiBase').value = CFG.apiBase;
  $('cfgPublicBase').value = CFG.publicBaseOverride;
  $('cfgDefaultPrefix').value = CFG.defaultPrefix;
  $('cfgDefaultStrategy').value = CFG.defaultStrategy;
  $('cfgTheme').value = CFG.theme;
  $('cfgEndpoint').value = CFG.r2Endpoint || '';
  $('cfgAccessKey').value = CFG.r2AccessKey || '';
  $('cfgSecretKey').value = CFG.r2SecretKey || '';
  $('cfgBucket').value = CFG.r2Bucket || '';
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
    r2Endpoint: $('cfgEndpoint').value.trim(),
    r2AccessKey: $('cfgAccessKey').value.trim(),
    r2SecretKey: $('cfgSecretKey').value.trim(),
    r2Bucket: $('cfgBucket').value.trim(),
  };
  saveCfg(CFG);
  applyTheme(CFG.theme);
  $('settingsDialog').close();
  // apply defaults to form
  if (!$('prefix').value) $('prefix').value = CFG.defaultPrefix;
  $('strategy').value = CFG.defaultStrategy;
  toast('设置已保存');
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
  if (!queue.length) { grid.innerHTML = '<div class="muted small" style="padding: 16px; text-align: center;">暂无选择的文件</div>'; return; }
  grid.innerHTML = queue.map((it) => {
    const isImg = it.file.type?.startsWith('image/');
    const name = escapeHtml(it.file.name);
    const size = fmtBytes(it.file.size);
    const badge = it.status === 'done' ? '<span class="badge ok">完成</span>' : it.status === 'error' ? `<span class="badge err" title="${escapeHtml(it.error)}">错误</span>` : `<span class="badge">${escapeHtml(it.status === 'queued' ? '等待' : it.status === 'uploading' ? '上传中' : it.status)}</span>`;
    const link = it.publicUrl ? `<a href="${it.publicUrl}" target="_blank" rel="noreferrer">打开</a>` : '';
    return `
      <div class="preview-item" data-id="${it.id}">
        <div class="thumb">
          ${isImg && it.url ? `<img src="${it.url}" alt="${name}" />` : `<div class="file-type">${name.split('.').pop()?.toUpperCase() || 'FILE'}</div>`}
          <button class="remove" data-remove="${it.id}">×</button>
        </div>
        <div class="meta">
          <div class="name" title="${name}">${name}</div>
          <div class="info">${size} ${badge} ${link ? ' • ' + link : ''}</div>
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
    if (it.status === 'uploading') { toast('上传中的文件无法移除'); return; }
    if (it.url) URL.revokeObjectURL(it.url);
    queue.splice(idx, 1);
    renderQueue();
    updateOverallProgress();
  }
}

function updateOverallProgress() {
  if (!queue.length) {
    $('overallProgress').value = 0;
    const progressText = document.querySelector('.progress-text');
    if (progressText) progressText.textContent = '0%';
    return;
  }
  const sum = queue.reduce((acc, it) => acc + (it.status === 'done' ? 100 : it.progress || 0), 0);
  const percent = Math.floor(sum / queue.length);
  $('overallProgress').value = percent;
  const progressText = document.querySelector('.progress-text');
  if (progressText) progressText.textContent = `${percent}%`;
}

$('btnUploadAll').addEventListener('click', async () => {
  // Check health before upload
  await checkHealth();

  const items = queue.filter((it) => it.status === 'queued' || it.status === 'error');
  if (!items.length) { toast('没有待上传的文件'); return; }
  let prefix = $('prefix').value.trim() || CFG.defaultPrefix;
  const strategy = $('strategy').value || CFG.defaultStrategy;
  if (prefix) prefix = prefix.replace(/\/$/, '');

  disableUploadUI(true);
  try {
    for (const it of items) {
      it.status = 'uploading'; it.progress = 0; renderQueue(); updateOverallProgress();
      try {
        const body = { filename: it.file.name, contentType: it.file.type || 'application/octet-stream', prefix, strategy };
        const signRes = await fetch(apiUrl('/api/sign-upload'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getR2Headers() },
          body: JSON.stringify(body)
        }).then(r => r.json());
        if (!signRes.url) throw new Error(signRes.error || 'No signed URL');
        await uploadWithProgress(signRes.url, it.file, it.file.type || 'application/octet-stream', (p) => { it.progress = p; updateItemProgress(it.id, p); });
        it.key = signRes.key;
        it.publicUrl = signRes.publicUrl || (CFG.publicBaseOverride ? `${CFG.publicBaseOverride}/${signRes.key}` : '');
        it.status = 'done'; it.progress = 100; renderQueue(); updateOverallProgress();
      } catch (e) {
        it.status = 'error'; it.error = e?.message || String(e); renderQueue(); updateOverallProgress();
      }
    }
    toast('所有文件上传完成');
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

$('btnList').addEventListener('click', async () => {
  await checkHealth();
  refreshList(true);
});
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
  const res = await fetch(url, { headers: getR2Headers() }).then(r => r.json());

  // Build table
  const rows = (res.contents || []).map((o) => {
    const k = o.key || '';
    const pub = composePublicUrl(k);
    return `
      <tr>
        <td><input type="checkbox" data-key="${escapeHtml(k)}" /></td>
        <td><code>${escapeHtml(k)}</code></td>
        <td>${o.size != null ? fmtBytes(o.size) : ''}</td>
        <td>${o.lastModified ? new Date(o.lastModified).toLocaleString('zh-CN') : ''}</td>
        <td>
          ${pub ? `<a href="${pub}" target="_blank" rel="noreferrer">🔗 打开</a> <button class="btn" data-copy="${pub}">📋 复制</button>` : '<span class="muted">🚫 无公开链接</span>'}
          <button class="btn btn-danger" data-del="${escapeHtml(k)}">🗑️ 删除</button>
        </td>
      </tr>
    `;
  }).join('');

  $('listResult').innerHTML = `
    <table>
      <thead>
        <tr>
          <th><input type="checkbox" id="chkAll"/></th>
          <th>文件路径</th>
          <th>大小</th>
          <th>修改时间</th>
          <th>操作</th>
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
  $('pageInfo').textContent = `第 ${page} 页${res.keyCount ? ` • ${res.keyCount} 项` : ''}`;
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
      toast('已复制到剪贴板');
    });
  });
}

function bindDeleteButtons(scope) {
  scope.querySelectorAll('button[data-del]')?.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-del');
      if (!key) return;
      if (!confirm(`确认删除:\n${key}?`)) return;
      await delKey(key);
      toast('已删除');
      refreshList(false);
    });
  });
}

async function delKey(key) {
  const url = apiUrl('/api/objects/' + encodeURIComponent(key));
  const res = await fetch(url, { method: 'DELETE', headers: getR2Headers() });
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
    if (!confirm(`确认删除 ${keys.length} 个文件?`)) return;
    // Use batch API
    const url = apiUrl('/api/objects/batch');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getR2Headers() },
      body: JSON.stringify({ action: 'delete', keys })
    });
    if (!res.ok) { toast('批量删除失败'); return; }
    toast('批量删除成功');
    refreshList(false);
  };
  updateState();
}

// Helpers
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Initial list on load
refreshList(true).catch(() => { });
