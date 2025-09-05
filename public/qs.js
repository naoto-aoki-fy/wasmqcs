// public/qs.js
// Common WASM bindings for browser and Node.js environments.
// Provides simple wrappers around Module.ccall with debug logging.

export function init(n, thr) {
  console.log('[init]', { n, thr });
  Module.ccall('qs_init', null, ['number', 'number'], [n, thr]);
}

export function reset() {
  console.log('[reset]');
  Module.ccall('qs_reset', null, [], []);
}

export function numQubits() {
  const n = Module.ccall('qs_num_qubits', 'number', [], []);
  console.log('[numQubits]', n);
  return n;
}

export function dim() {
  const d = Module.ccall('qs_dim', 'number', [], []);
  console.log('[dim]', d);
  return d;
}

export function applyGate(kind, target, control, theta) {
  console.log('[applyGate]', { kind, target, control, theta });
  switch (kind) {
    case 'H': Module.ccall('qs_apply_h', null, ['number'], [target]); break;
    case 'X': Module.ccall('qs_apply_x', null, ['number'], [target]); break;
    case 'RX': Module.ccall('qs_apply_rx', null, ['number', 'number'], [target, theta]); break;
    case 'RY': Module.ccall('qs_apply_ry', null, ['number', 'number'], [target, theta]); break;
    case 'RZ': Module.ccall('qs_apply_rz', null, ['number', 'number'], [target, theta]); break;
    case 'CNOT': Module.ccall('qs_apply_cnot', null, ['number', 'number'], [control, target]); break;
    default:
      console.warn('Unknown gate', kind);
  }
}

export function getProbsRange(offset, count) {
  console.log('[getProbsRange]', { offset, count });
  const bytes = count * 4;
  const ptr = Module._malloc(bytes);
  try {
    Module.ccall('qs_get_probs_range', null, ['number', 'number', 'number'], [offset, count, ptr]);
    const view = new Float32Array(Module.HEAPF32.buffer, ptr, count);
    return new Float32Array(view); // copy out
  } finally {
    Module._free(ptr);
  }
}

export function sample() {
  const idx = Module.ccall('qs_sample', 'number', [], []);
  console.log('[sample]', idx);
  return idx;
}
