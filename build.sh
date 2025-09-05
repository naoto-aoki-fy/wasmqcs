#!/usr/bin/env bash
set -euo pipefail

# Build script for emcc
# Prerequisites:
#   - Install Emscripten SDK and activate (source emsdk_env.sh)
#   - Node.js (for server)
#
# Usage:
#   ./build.sh

mkdir -p public

emcc src/sim.cpp -O3 -std=c++20 -pthread \
  -sUSE_PTHREADS=1 \
  -sEXPORTED_FUNCTIONS=_malloc,_free,_qs_init,_qs_free,_qs_reset,_qs_num_qubits,_qs_dim,_qs_apply_h,_qs_apply_x,_qs_apply_rx,_qs_apply_ry,_qs_apply_rz,_qs_apply_cnot,_qs_get_probs_range,_qs_sample \
  -sEXPORTED_RUNTIME_METHODS=cwrap,ccall,HEAPF32 \
  -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_MEMORY=128MB \
  -sWASM=1 \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -o public/sim.js

echo "Build complete: public/sim.js (and sim.wasm)"
echo "Run:  node server.mjs"
