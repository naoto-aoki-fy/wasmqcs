// src/sim.cpp
// A minimal parallel state-vector simulator using C++ threads (mapped to Web Workers via Emscripten pthreads).
// Build with Emscripten: see ../build.sh
//
// Notes:
// - Uses std::thread with a tiny internal task dispatcher (range-splitting).
// - Works only when running under crossOriginIsolated (COOP/COEP) so that SharedArrayBuffer is available.
// - Parallel loops write to a separate scratch buffer to avoid data races.
//
// Copyright: MIT

#include <emscripten.h>
#include <vector>
#include <complex>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <functional>
#include <atomic>
#include <random>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>

using complexf = std::complex<float>;

namespace qsim {

static int g_num_threads = 1;
static uint32_t g_n_qubits = 0;
static size_t g_dim = 0;

static std::vector<complexf> g_state;
static std::vector<complexf> g_scratch;

// --- simple work dispatcher (fan-out a single "range job" to worker threads) ---
static std::vector<std::thread> g_workers;
static std::mutex g_mtx;
static std::condition_variable g_cv_job;
static std::condition_variable g_cv_done;
static bool g_has_job = false;
static bool g_shutdown = false;
static std::function<void(size_t,size_t)> g_job;
static size_t g_total_items = 0;
static size_t g_chunk = 1;
static std::atomic<size_t> g_next{0};
static int g_working_threads = 0;

static inline void worker_loop(int /*tid*/) {
    for (;;) {
        std::unique_lock<std::mutex> lk(g_mtx);
        g_cv_job.wait(lk, []{ return g_has_job || g_shutdown; });
        if (g_shutdown) {
            return;
        }
        auto local_job = g_job;
        size_t local_total = g_total_items;
        size_t local_chunk = g_chunk;
        lk.unlock();

        for (;;) {
            size_t start = g_next.fetch_add(local_chunk, std::memory_order_relaxed);
            if (start >= local_total) break;
            size_t end = std::min(start + local_chunk, local_total);
            local_job(start, end);
        }

        std::lock_guard<std::mutex> lk2(g_mtx);
        if (--g_working_threads == 0) {
            g_has_job = false;
            g_cv_done.notify_one();
        }
    }
}

static void ensure_threads(int nthreads) {
    if (nthreads < 1) nthreads = 1;
    if (!g_workers.empty()) return;
    g_num_threads = nthreads;
    g_workers.reserve(g_num_threads);
    for (int i = 0; i < g_num_threads; ++i) {
        g_workers.emplace_back(worker_loop, i);
    }
}

static inline void parallel_for(size_t total_items, size_t chunk,
                                const std::function<void(size_t,size_t)>& fn) {
    if (g_num_threads <= 1 || total_items <= chunk) {
        fn(0, total_items);
        return;
    }
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        g_job = fn;
        g_total_items = total_items;
        g_chunk = chunk;
        g_next.store(0, std::memory_order_relaxed);
        g_working_threads = g_num_threads;
        g_has_job = true;
    }
    g_cv_job.notify_all();
    std::unique_lock<std::mutex> lk(g_mtx);
    g_cv_done.wait(lk, []{ return !g_has_job; });
}

// Utility: bit insertion at position 'tbit' (insert 0)
// Returns an index with a zero bit inserted at tbit in p (p encodes all other bits).
static inline size_t insert_zero_bit(size_t p, int tbit) {
    const size_t lowmask = (size_t(1) << tbit) - 1;
    size_t low = p & lowmask;
    size_t high = p >> tbit;
    return (high << (tbit + 1)) | low;
}

// --- gate implementations ---
static inline void apply_matrix_2x2(int target,
    const complexf& m00, const complexf& m01,
    const complexf& m10, const complexf& m11) {

    const size_t pairs = g_dim >> 1;
    auto job = [&](size_t start, size_t end) {
        for (size_t p = start; p < end; ++p) {
            size_t i0 = insert_zero_bit(p, target);
            size_t i1 = i0 | (size_t(1) << target);
            complexf a0 = g_state[i0];
            complexf a1 = g_state[i1];
            g_scratch[i0] = m00 * a0 + m01 * a1;
            g_scratch[i1] = m10 * a0 + m11 * a1;
        }
    };
    parallel_for(pairs, 8192, job);
    std::swap(g_state, g_scratch);
}

static inline void apply_x(int target) {
    const size_t pairs = g_dim >> 1;
    auto job = [&](size_t start, size_t end) {
        for (size_t p = start; p < end; ++p) {
            size_t i0 = insert_zero_bit(p, target);
            size_t i1 = i0 | (size_t(1) << target);
            complexf a0 = g_state[i0];
            complexf a1 = g_state[i1];
            g_scratch[i0] = a1;
            g_scratch[i1] = a0;
        }
    };
    parallel_for(pairs, 8192, job);
    std::swap(g_state, g_scratch);
}

static inline void apply_h(int target) {
    const float invsqrt2 = 0.7071067811865475f;
    complexf m00(invsqrt2, 0.0f), m01(invsqrt2, 0.0f);
    complexf m10(invsqrt2, 0.0f), m11(-invsqrt2, 0.0f);
    apply_matrix_2x2(target, m00, m01, m10, m11);
}

static inline void apply_rz(int target, float theta) {
    float c = std::cos(0.5f * theta);
    float s = std::sin(0.5f * theta);
    // diag(e^{-iθ/2}, e^{+iθ/2}) = [c - i s, 0; 0, c + i s]
    complexf e0(c, -s);
    complexf e1(c, +s);
    const size_t pairs = g_dim >> 1;
    auto job = [&](size_t start, size_t end) {
        for (size_t p = start; p < end; ++p) {
            size_t i0 = insert_zero_bit(p, target);
            size_t i1 = i0 | (size_t(1) << target);
            g_scratch[i0] = e0 * g_state[i0];
            g_scratch[i1] = e1 * g_state[i1];
        }
    };
    parallel_for(pairs, 8192, job);
    std::swap(g_state, g_scratch);
}

static inline void apply_ry(int target, float theta) {
    float c = std::cos(0.5f * theta);
    float s = std::sin(0.5f * theta);
    complexf m00(c, 0.0f), m01(-s, 0.0f);
    complexf m10(s, 0.0f), m11(c, 0.0f);
    apply_matrix_2x2(target, m00, m01, m10, m11);
}

static inline void apply_rx(int target, float theta) {
    float c = std::cos(0.5f * theta);
    float s = std::sin(0.5f * theta);
    // Rx = [[c, -i s], [-i s, c]]
    complexf m00(c, 0.0f), m01(0.0f, -s);
    complexf m10(0.0f, -s), m11(c, 0.0f);
    apply_matrix_2x2(target, m00, m01, m10, m11);
}

static inline void apply_cnot(int control, int target) {
    if (control == target) return;
    const size_t N = g_dim;
    const size_t cmask = size_t(1) << control;
    const size_t tmask = size_t(1) << target;
    auto job = [&](size_t start, size_t end) {
        for (size_t i = start; i < end; ++i) {
            size_t dst = (i & cmask) ? (i ^ tmask) : i;
            g_scratch[dst] = g_state[i];
        }
    };
    parallel_for(N, 65536, job);
    std::swap(g_state, g_scratch);
}

// --- API exported to JS ---

extern "C" {

EMSCRIPTEN_KEEPALIVE
void qs_init(uint32_t n_qubits, int n_threads) {
    if (n_qubits > 28) {
        // Safety clamp (memory explodes). 2^28 * 16 bytes * 2 buffers ≈ 8.6 GB
        n_qubits = 28;
    }
    g_n_qubits = n_qubits;
    g_dim = size_t(1) << g_n_qubits;
    ensure_threads(n_threads > 0 ? n_threads : 1);
    g_state.assign(g_dim, complexf(0.0f, 0.0f));
    g_scratch.assign(g_dim, complexf(0.0f, 0.0f));
    // |0...0>
    g_state[0] = complexf(1.0f, 0.0f);
}

EMSCRIPTEN_KEEPALIVE
void qs_free() {
    {
        std::lock_guard<std::mutex> lk(g_mtx);
        g_shutdown = true;
        g_has_job = false;
    }
    g_cv_job.notify_all();
    for (auto &t : g_workers) {
        if (t.joinable()) t.join();
    }
    g_workers.clear();
    g_state.clear();
    g_scratch.clear();
    g_dim = 0;
    g_n_qubits = 0;
}

EMSCRIPTEN_KEEPALIVE
void qs_reset() {
    if (g_dim == 0) return;
    std::fill(g_state.begin(), g_state.end(), complexf(0.0f, 0.0f));
    g_state[0] = complexf(1.0f, 0.0f);
}

EMSCRIPTEN_KEEPALIVE
uint32_t qs_num_qubits() { return g_n_qubits; }

EMSCRIPTEN_KEEPALIVE
uint32_t qs_dim() { return (uint32_t)g_dim; }

EMSCRIPTEN_KEEPALIVE
void qs_apply_h(int target) {
    if (target < 0 || (uint32_t)target >= g_n_qubits) return;
    apply_h(target);
}

EMSCRIPTEN_KEEPALIVE
void qs_apply_x(int target) {
    if (target < 0 || (uint32_t)target >= g_n_qubits) return;
    apply_x(target);
}

EMSCRIPTEN_KEEPALIVE
void qs_apply_rx(int target, float theta) {
    if (target < 0 || (uint32_t)target >= g_n_qubits) return;
    apply_rx(target, theta);
}

EMSCRIPTEN_KEEPALIVE
void qs_apply_ry(int target, float theta) {
    if (target < 0 || (uint32_t)target >= g_n_qubits) return;
    apply_ry(target, theta);
}

EMSCRIPTEN_KEEPALIVE
void qs_apply_rz(int target, float theta) {
    if (target < 0 || (uint32_t)target >= g_n_qubits) return;
    apply_rz(target, theta);
}

EMSCRIPTEN_KEEPALIVE
void qs_apply_cnot(int control, int target) {
    if (control < 0 || target < 0) return;
    if ((uint32_t)control >= g_n_qubits || (uint32_t)target >= g_n_qubits) return;
    apply_cnot(control, target);
}

EMSCRIPTEN_KEEPALIVE
void qs_get_probs_range(uint32_t offset, uint32_t count, float* out_probs) {
    if (!out_probs) return;
    size_t off = std::min<size_t>(offset, g_dim);
    size_t cnt = std::min<size_t>(count, g_dim - off);
    for (size_t i = 0; i < cnt; ++i) {
        const complexf a = g_state[off + i];
        out_probs[i] = a.real()*a.real() + a.imag()*a.imag();
    }
}

// Return one measurement sample as a bitstring index (0..2^n - 1).
EMSCRIPTEN_KEEPALIVE
uint32_t qs_sample() {
    static thread_local std::mt19937 rng{std::random_device{}()};
    std::uniform_real_distribution<float> dist(0.0f, 1.0f);
    float r = dist(rng);
    // CDF scan
    float acc = 0.0f;
    for (size_t i = 0; i < g_dim; ++i) {
        const complexf a = g_state[i];
        acc += a.real()*a.real() + a.imag()*a.imag();
        if (r <= acc) {
            return static_cast<uint32_t>(i);
        }
    }
    // numeric tail
    return static_cast<uint32_t>(g_dim - 1);
}

} // extern "C"

} // namespace qsim

// extern "C" {
int main(int argc, char** argv) {
    (void)argc; (void)argv;
    return 0;
}
// }