// public/app.js
// Minimal UI glue that calls into the WASM module via common helpers.

import { init, reset, numQubits, dim, applyGate, getProbsRange, sample } from './qs.js';

console.log('[app.js] script loaded');

function updateProbTable() {
  const viewCount = Math.min(Number(document.getElementById('viewCount').value || 4096), dim());
  console.log('[updateProbTable] viewCount', viewCount);
  const probs = getProbsRange(0, viewCount);
  const container = document.getElementById('probs');
  const rows = [];
  rows.push('<table><thead><tr><th>#</th><th>bitstring</th><th>P</th></tr></thead><tbody>');
  const n = numQubits();
  for (let i = 0; i < probs.length; ++i) {
    if (probs[i] === 0) continue;
    const bits = i.toString(2).padStart(n, '0');
    rows.push(`<tr><td class="idx">${i}</td><td><code>${bits}</code></td><td>${probs[i].toFixed(6)}</td></tr>`);
  }
  rows.push('</tbody></table>');
  container.innerHTML = rows.join('');
}

function oneShot() {
  const idx = sample();
  const n = numQubits();
  const bits = idx.toString(2).padStart(n, '0');
  console.log('[oneShot] idx', idx);
  document.getElementById('shotOut').textContent = `→ Measurement result: |${bits}⟩ (index ${idx})`;
}

function applyGateFromUI(kind) {
  const t = Number(document.getElementById('targetQ').value || 0);
  const c = Number(document.getElementById('controlQ').value || 1);
  const th = Number(document.getElementById('theta').value || 0);
  console.log('[applyGateFromUI]', { kind, t, c, th });
  applyGate(kind, t, c, th);
  updateProbTable();
}

function bindUI() {
  console.log('[bindUI] attaching event listeners');
  if (!crossOriginIsolated) {
    document.getElementById('xo-warning').hidden = false;
  }
  document.getElementById('btnInit').addEventListener('click', () => {
    const n = Number(document.getElementById('nQubits').value || 18);
    const thr = Number(document.getElementById('nThreads').value || Module.pthreadPoolSize || 4);
    console.log('[btnInit.click]', { n, thr });
    init(n, thr);
    document.getElementById('targetQ').max = String(n-1);
    document.getElementById('controlQ').max = String(n-1);
    updateProbTable();
  });
  document.getElementById('btnReset').addEventListener('click', () => {
    console.log('[btnReset.click]');
    reset();
    updateProbTable();
  });
  document.querySelectorAll('.gates button').forEach(btn => {
    btn.addEventListener('click', () => {
      console.log('[gate.click]', btn.dataset.g);
      applyGateFromUI(btn.dataset.g);
    });
  });
  document.getElementById('btnRefresh').addEventListener('click', () => {
    console.log('[btnRefresh.click]');
    updateProbTable();
  });
  document.getElementById('btnOneShot').addEventListener('click', () => {
    console.log('[btnOneShot.click]');
    oneShot();
  });
}

function setup() {
  console.log('[wasm-ready]');
  // prepare cwraps if you prefer direct function pointers (ccall used above for brevity)
  bindUI();
}

if (Module.runtimeInitialized) {
  setup();
} else {
  document.addEventListener('wasm-ready', setup);
}
