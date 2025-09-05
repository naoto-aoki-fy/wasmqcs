# Browser Quantum State-Vector Simulator (C++ → WebAssembly, pthreads)

**特徴**

- C++ で実装した状態ベクトル法の量子シミュレータ
- Emscripten で WebAssembly 化、`-sUSE_PTHREADS=1` により Web Workers 上で**共有メモリ並列**実行
- 単一ビットゲート H / X / RX / RY / RZ、2ビットゲート CNOT を実装
- 確率プレビューと単発測定（サンプリング）
- スレッドプール（簡易ディスパッチャ）により各ゲート適用を並列化
- `-sPROXY_TO_PTHREAD` 採用：メインロジックは Worker 内で実行され、待機や条件変数も使用可能

> ⚠️ 重要: pthreads/SharedArrayBuffer をブラウザで使うには `crossOriginIsolated` が必須です。\
> サーバ側で以下ヘッダを付与してください：\
> `Cross-Origin-Opener-Policy: same-origin`\
> `Cross-Origin-Embedder-Policy: require-corp`

---

## 動かし方

### 1) 依存関係

- **Emscripten**（最新版推奨）をインストールし、有効化します。例：

```bash
git clone https://github.com/emscripten-core/emsdk && cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

- **Node.js**（v18+ 推奨）

### 2) ビルド

```bash
./build.sh
```

出力: `public/sim.js`, `public/sim.wasm`, `public/sim.worker.js`

### 3) サーブ（ヘッダ付き）

本リポジトリにはヘッダ設定済みの簡易サーバ `server.mjs` を同梱しています。

```bash
npm i express
node server.mjs
```

ブラウザで以下へアクセス：

```
http://localhost:8080
```

初回読み込み時に UI の上部に `crossOriginIsolated` 警告が出る場合は、HTTP レイヤのヘッダ設定を見直してください。

---

## 設計メモ

- **メモリ**: `complex<float>` を使用。状態ベクトルとスクラッチの二重バッファで**レース回避**。メモリ消費はおよそ `2 * 2^n * 8 bytes`（実部/虚部で計 16 バイト/振幅 × 2 バッファ = 32 バイト/基底状態）。
  - 例) 20量子ビット → 約 32 MB 程度。
- **並列化**: ターゲットビットの挿入写像（`insert_zero_bit`）により「振幅ペア」を連続インデックスに落とし込み、チャンク分割で各スレッドへ分配。
- **ブロッキング**: `-sPROXY_TO_PTHREAD` によりメインスレッドは Worker 側で動作し、条件変数や `join` 等のブロッキングが可能。
- **CNOT**: 置換（Permutation）として実装。`dst = (i & cmask) ? (i ^ tmask) : i` をスクラッチに書き出すため、データ競合なし。

---

## 公開 API（JS から呼出）

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

UI 側では `Module.ccall` / `Module.cwrap` で呼び出しています。必要に応じて独自のカスタムゲート（2×2 の一般複素行列）を追加してください（`apply_matrix_2x2` を利用）。

---

## よくある質問

- **Q: 量子ビット数を増やすと落ちる/固まる？**  
  A: メモリ逼迫です。`ALLOW_MEMORY_GROWTH=1` ですが、ブラウザと OS の制約を超えると失敗します。20～22量子ビットくらいが実用範囲です（マシン次第）。

- **Q: スレッド数はどう決める？**  
  A: 目安として `navigator.hardwareConcurrency` を上限 8 くらいで使っています。重い回路では増やし、軽い回路では減らしてください。

- **Q: 他のゲート（S, T, SWAP, 任意 2 量子ビット行列など）は？**  
  A: 同様のパターンで追加可能です。アルゴリズムは「読み取りを `state` から、書き込みを `scratch` へ」に徹すれば安全に並列化できます。

---

## ライセンス

MIT
