# Browser Quantum State-Vector Simulator (C++ → WebAssembly, pthreads)

**Features**

- State-vector quantum simulator implemented in C++
- Compiled to WebAssembly via Emscripten. `-sUSE_PTHREADS=1` enables **shared-memory parallel** execution on Web Workers
- Implements single-qubit gates H / X / RX / RY / RZ and two-qubit gate CNOT
- Probability preview and single-shot measurement (sampling)
- Parallelizes gate application using a thread pool (lightweight dispatcher)
- Uses `-sPROXY_TO_PTHREAD`: the main logic runs inside a Worker, allowing waits and condition variables

> ⚠️ Important: `crossOriginIsolated` is required to use pthreads/SharedArrayBuffer in browsers.\
> Make sure the server sends:\
> `Cross-Origin-Opener-Policy: same-origin`\
> `Cross-Origin-Embedder-Policy: require-corp`

---

## How to Run

### 1) Dependencies

- Install and activate **Emscripten** (latest recommended). Example:

```bash
git clone https://github.com/emscripten-core/emsdk && cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

- **Node.js** (v18+ recommended)

### 2) Build

```bash
./build.sh
```

Outputs: `public/sim.js`, `public/sim.wasm`, `public/sim.worker.js`

### 3) Serve (with headers)

This repository bundles a simple server `server.mjs` with the required headers configured.

```bash
npm i express
node server.mjs
```

Access in your browser:

```
http://localhost:8080
```

If a `crossOriginIsolated` warning appears at the top of the UI on first load, review your HTTP headers.

### 4) Node.js Command-Line Execution

The same WASM module can be invoked from Node.js as well as the browser.

```
node cli.mjs [num_qubits] [num_threads]
```

If `sim.wasm` is missing on the first run, build it with `./build.sh`.

---

## Design Notes

- **Memory**: uses `complex<float>`. A dual buffer of state and scratch avoids data races. Memory consumption is roughly `2 * 2^n * 8 bytes` (16 bytes per amplitude for real/imag, ×2 buffers = 32 bytes per basis state).
  - Example: 20 qubits → about 32 MB.
- **Parallelization**: the target-bit insertion mapping (`insert_zero_bit`) makes amplitude pairs contiguous and distributes chunks to threads.
- **Blocking**: with `-sPROXY_TO_PTHREAD`, the main thread runs inside a Worker so blocking operations like condition variables and `join` are possible.
- **CNOT**: implemented as a permutation. Writing `dst = (i & cmask) ? (i ^ tmask) : i` to the scratch buffer avoids data races.

---

## Public API (callable from JS)

```c
void   qs_init(uint32_t n_qubits, int n_threads);
void   qs_free(void);
void   qs_reset(void);
uint32_t qs_num_qubits(void);
uint32_t qs_dim(void);

void   qs_apply_h(int target);
void   qs_apply_x(int target);
void   qs_apply_rx(int target, float theta);
void   qs_apply_ry(int target, float theta);
void   qs_apply_rz(int target, float theta);
void   qs_apply_cnot(int control, int target);

void   qs_get_probs_range(uint32_t offset, uint32_t count, float* out_probs);
uint32_t qs_sample(void);
```

The UI calls these via `Module.ccall` / `Module.cwrap`. Add custom gates (arbitrary 2×2 complex matrices) as needed using `apply_matrix_2x2`.

---

## FAQ

- **Q: It crashes or freezes when increasing qubits?**
  A: Memory pressure. `ALLOW_MEMORY_GROWTH=1` is enabled, but exceeding browser/OS limits causes failure. Around 20–22 qubits is practical (depending on your machine).

- **Q: How should I choose the number of threads?**
  A: As a guideline, use up to `navigator.hardwareConcurrency` capped at about 8. Increase for heavy circuits and decrease for light ones.

- **Q: What about other gates (S, T, SWAP, arbitrary 2-qubit matrices, etc.)?**
  A: They can be added similarly. Follow the pattern "read from `state`, write to `scratch`" for safe parallelization.

---

## License

MIT
