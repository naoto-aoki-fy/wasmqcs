// public/app.js
// Minimal UI glue that calls into the WASM module via cwrap/ccall.

let qs_init, qs_free, qs_reset, qs_num_qubits, qs_dim,
    qs_apply_h, qs_apply_x, qs_apply_rx, qs_apply_ry, qs_apply_rz, qs_apply_cnot,
    qs_get_probs_range, qs_sample;

// Utility to allocate and read back a float array from WASM memory
function getProbsRange(offset, count) {
  const bytes = count * 4;
  const ptr = Module._malloc(bytes);
  try {
    Module.ccall('qs_get_probs_range', null, ['number','number','number'], [offset, count, ptr]);
    const view = new Float32Array(Module.HEAPF32.buffer, ptr, count);
    return new Float32Array(view); // copy out
  } finally {
    Module._free(ptr);
  }
}

function updateProbTable() {
  const viewCount = Math.min(Number(document.getElementById('viewCount').value || 4096), Module.ccall('qs_dim', 'number', [], []));
  const probs = getProbsRange(0, viewCount);
  const container = document.getElementById('probs');
  const rows = [];
  rows.push('<table><thead><tr><th>#</th><th>bitstring</th><th>P</th></tr></thead><tbody>');
  const n = Module.ccall('qs_num_qubits', 'number', [], []);
  for (let i = 0; i < probs.length; ++i) {
    if (probs[i] === 0) continue;
    const bits = i.toString(2).padStart(n, '0');
    rows.push(`<tr><td class="idx">${i}</td><td><code>${bits}</code></td><td>${probs[i].toFixed(6)}</td></tr>`);
  }
  rows.push('</tbody></table>');
  container.innerHTML = rows.join('');
}

function oneShot() {
  const idx = Module.ccall('qs_sample', 'number', [], []);
  const n = Module.ccall('qs_num_qubits', 'number', [], []);
  const bits = idx.toString(2).padStart(n, '0');
  document.getElementById('shotOut').textContent = `→ 測定結果: |${bits}⟩  (index ${idx})`;
}

function applyGate(kind) {
  const t = Number(document.getElementById('targetQ').value || 0);
  const c = Number(document.getElementById('controlQ').value || 1);
  const th = Number(document.getElementById('theta').value || 0);
  switch (kind) {
    case 'H': Module.ccall('qs_apply_h', null, ['number'], [t]); break;
    case 'X': Module.ccall('qs_apply_x', null, ['number'], [t]); break;
    case 'RX': Module.ccall('qs_apply_rx', null, ['number','number'], [t, th]); break;
    case 'RY': Module.ccall('qs_apply_ry', null, ['number','number'], [t, th]); break;
    case 'RZ': Module.ccall('qs_apply_rz', null, ['number','number'], [t, th]); break;
    case 'CNOT': Module.ccall('qs_apply_cnot', null, ['number','number'], [c, t]); break;
  }
  updateProbTable();
}

function bindUI() {
  if (!crossOriginIsolated) {
    document.getElementById('xo-warning').hidden = false;
  }
  document.getElementById('btnInit').addEventListener('click', () => {
    const n = Number(document.getElementById('nQubits').value || 18);
    const thr = Number(document.getElementById('nThreads').value || Module.pthreadPoolSize || 4);
    Module.ccall('qs_init', null, ['number','number'], [n, thr]);
    document.getElementById('targetQ').max = String(n-1);
    document.getElementById('controlQ').max = String(n-1);
    updateProbTable();
  });
  document.getElementById('btnReset').addEventListener('click', () => {
    Module.ccall('qs_reset', null, [], []);
    updateProbTable();
  });
  document.querySelectorAll('.gates button').forEach(btn => {
    btn.addEventListener('click', () => applyGate(btn.dataset.g));
  });
  document.getElementById('btnRefresh').addEventListener('click', updateProbTable);
  document.getElementById('btnOneShot').addEventListener('click', oneShot);
}

document.addEventListener('wasm-ready', () => {
  // prepare cwraps if you prefer direct function pointers (ccall used above for brevity)
  bindUI();
});
