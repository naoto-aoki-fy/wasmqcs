// cli.mjs
// Simple Node.js entry point to run the WASM simulator from the command line.
// Usage: node cli.mjs [n_qubits] [n_threads]

import { init, reset, numQubits, dim, applyGate, getProbsRange, sample } from './public/qs.js';

// Prepare Module configuration for Emscripten before loading the runtime.
globalThis.Module = {
  locateFile: (path) => new URL('./public/' + path, import.meta.url).pathname,
  onRuntimeInitialized() {
    console.log('[runtime initialized]');
    run();
  }
};

await import('./public/sim.js');

function run() {
  const n = Number(process.argv[2] || 2);
  const thr = Number(process.argv[3] || 2);
  init(n, thr);
  console.log('numQubits', numQubits());
  const showCount = Math.min(dim(), 8);
  console.log('probs', Array.from(getProbsRange(0, showCount)));
  applyGate('H', 0);
  console.log('after H', Array.from(getProbsRange(0, showCount)));
  console.log('sample', sample());
  reset();
}
