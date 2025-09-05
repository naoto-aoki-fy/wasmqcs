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
  -sPROXY_TO_PTHREAD \
  -sEXPORTED_FUNCTIONS=_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=cwrap,ccall \
  -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_MEMORY=128MB \
  -sWASM=1 \
  -o public/sim.js

echo "Build complete: public/sim.js (and sim.wasm, sim.worker.js)"
echo "Run:  node server.mjs"
