# wllama WASM ビルドガイド

この文書では、weavelet-canvas 向けに配布している単一の `vendor/wllama`
成果物セットを再ビルドする手順を説明します。

リポジトリ運用方針:

- upstream の `wllama` / `llama.cpp` ソースは `vendor/wllama-src/` に取得する（`gitignore` 対象）
- 再現可能な差分は `vendor/wllama-patches/` 配下にパッチとして保存する
- low-bit-q 固有の拡張は `vendor/wllama/lowbit-q/` で保守する

## 概要

ビルドでは 3 つの軸の組み合わせとして 8 種類の WASM バリアントを生成します。各
WASM バリアントは、同じビルドバリアントから生成された Emscripten の JS glue と
セットで配布しなければなりません。

| 軸 | 値 | 注記 |
|------|--------|-------|
| スレッド | single-thread / multi-thread | multi-thread には COOP/COEP ヘッダーが必要 |
| メモリモデル | memory64 / compat | Memory64 は 2 GB 超のヒープに対応、compat は Memory64 非対応ブラウザ向け |
| WebGPU 非同期モード | JSPI / Asyncify / なし | JSPI と Asyncify は**別ビルド**で、WASM も glue も共有しない |

**JSPI** と **Asyncify** のどちらも emdawnwebgpu の `TimedWaitAny` 要件を満たします。
いずれも有効でない場合、emdawnwebgpu ランタイムは `TimedWaitAny` を拒否し、
`wgpuCreateInstance()` は null を返してモデル読み込みが次の箇所で中断されます。

```text
ggml-webgpu.cpp:2593: GGML_ASSERT(webgpu_ctx->instance != nullptr) failed
```

詳細は既知の落とし穴 #9 を参照してください。

バリアント種別ごとのビルド出力:

```text
# CPU バリアント（デフォルトでビルドされる）
wasm/single-thread-cpu-mem64/wllama.wasm    (~2.2 MB)
wasm/multi-thread-cpu-mem64/wllama.wasm     (~2.3 MB)
wasm/single-thread-cpu-compat/wllama.wasm   (~2.2 MB)
wasm/multi-thread-cpu-compat/wllama.wasm    (~2.2 MB)

# WebGPU + JSPI compat バリアント（WLLAMA_BUILD_WEBGPU=1）
wasm/single-thread-webgpu-compat/wllama.wasm  (~2.9 MB)
wasm/multi-thread-webgpu-compat/wllama.wasm   (~3.0 MB)
# 注: single-thread-webgpu / multi-thread-webgpu（Memory64 + JSPI + WebGPU）は
# upstream artifact のみ。このリポジトリのスクリプトではビルドしない。

# WebGPU + Asyncify compat バリアント（WLLAMA_BUILD_WEBGPU_ASYNCIFY=1）— experimental
wasm/single-thread-webgpu-asyncify-compat/wllama.wasm  (~3.1 MB)
wasm/multi-thread-webgpu-asyncify-compat/wllama.wasm   (~3.2 MB)
```

各バリアントは `wllama.js`（Emscripten の JS glue）も生成します。この JS glue は
Memory64/compat/WebGPU の各バリアント間で互換ではありません。成果物をメイン
プロジェクトにコピーする前に、各バリアントの glue をパッチして埋め込む必要があります。

バリアント対応表:

> **glue ファイル**は `src/vendor/wllama/` 配下のスタンドアロン JS モジュールです。
> WASM バイナリに埋め込まれた文字列定数ではありません。`wllamaWorker.ts` が
> `src/vendor/wllama/variant-table.ts` の `glue` フィールドに基づいて実行時に
> ロードします。`GlueKind → ファイル` の対応表は
> `src/vendor/wllama/glue-path.ts` が正本です。

| `vendor/wllama/` 内のランタイムファイル | WASM ビルドソース | JS glue ファイル（`src/vendor/wllama/`） | ステータス |
|----------------------------------------|-------------------|-----------------------------------------|------------|
| `single-thread-cpu-mem64.wasm` | `wasm/single-thread-cpu-mem64/wllama.wasm` | `mem64-index.js` | active |
| `multi-thread-cpu-mem64.wasm` | `wasm/multi-thread-cpu-mem64/wllama.wasm` | `mem64-index.js` | active |
| `single-thread-cpu-compat.wasm` | `wasm/single-thread-cpu-compat/wllama.wasm` | `index.js` | active |
| `multi-thread-cpu-compat.wasm` | `wasm/multi-thread-cpu-compat/wllama.wasm` | `index.js` | active |
| `single-thread-webgpu.wasm` | —（upstream artifact のみ） | — | **variant-table にエントリなし；選択されない** |
| `multi-thread-webgpu.wasm` | —（upstream artifact のみ） | — | **variant-table にエントリなし；選択されない** |
| `single-thread-webgpu-compat.wasm` | `wasm/single-thread-webgpu-compat/wllama.wasm` | `webgpu-index.js` | active |
| `multi-thread-webgpu-compat.wasm` | `wasm/multi-thread-webgpu-compat/wllama.wasm` | `webgpu-index.js` | active |
| `single-thread-webgpu-asyncify-compat.wasm` | `wasm/single-thread-webgpu-asyncify-compat/wllama.wasm` | `webgpu-asyncify-index.js` | experimental, disabled |
| `multi-thread-webgpu-asyncify-compat.wasm` | `wasm/multi-thread-webgpu-asyncify-compat/wllama.wasm` | `webgpu-asyncify-index.js` | experimental, disabled |

## 前提条件

### Emscripten SDK

すべてのビルド対象に単一の SDK バージョンを使用します。

| ビルド種別 | 必要な emsdk | 動作確認済み |
|------------|----------------|------------|
| CPU compat（`*-cpu-compat`） | **≥ 5.0.0** | 5.0.5 |
| CPU Memory64（`*-cpu-mem64`） | **≥ 5.0.0** | 5.0.5 |
| WebGPU + JSPI（`*-webgpu-compat`） | **≥ 5.0.0** | 5.0.5 |
| WebGPU + Asyncify（`*-webgpu-asyncify-compat`） | **≥ 5.0.0** | 5.0.5 |

自動ビルドスクリプト（`scripts/wllama/build.sh`）は semver チェックによって
5.0.0 未満の場合はエラー終了します。5.0.0〜5.0.4 は未検証のため、
疑わしい場合は `SpecAndStatus.md`（Asyncify build notes 表）に記録されているバージョンを使用してください。

```bash
# 一度だけインストール
cd ~/emsdk
./emsdk install latest
./emsdk activate latest
source emsdk_env.sh

# CPU ビルド（compat + Memory64）
bash scripts/wllama/build.sh

# WebGPU JSPI ビルド（compat のみ — Memory64 WebGPU はビルドしない）
WLLAMA_BUILD_WEBGPU=1 WLLAMA_SYNC_VENDOR_JS=1 bash scripts/wllama/build.sh

# WebGPU Asyncify ビルド（experimental）
WLLAMA_BUILD_WEBGPU_ASYNCIFY=1 WLLAMA_SYNC_VENDOR_JS=1 bash scripts/wllama/build.sh

# JSPI + Asyncify 両方ビルド
WLLAMA_BUILD_WEBGPU=1 WLLAMA_BUILD_WEBGPU_ASYNCIFY=1 WLLAMA_SYNC_VENDOR_JS=1 bash scripts/wllama/build.sh
```

`WLLAMA_SYNC_VENDOR_JS=1` を付けると、すべての成果物が自動コピーされます。
- WASM バイナリ → `vendor/wllama/*.wasm`
- JS glue → `src/vendor/wllama/{index,mem64-index,webgpu-index,webgpu-asyncify-index}.js`

各 glue ファイルはそれぞれのビルドディレクトリが生成した `esm/index.js` を
リネームしてコピーしたものです（`esm/mem64.js` のようなファイルは存在しません）。
glue ファイルは手動コピーせず `WLLAMA_SYNC_VENDOR_JS=1` を使ってください。

### emdawnwebgpu（WebGPU ビルド時のみ）

emsdk 4.0.10 以降には `emdawnwebgpu` が **built-in port** として含まれており、
別途ダウンロードは不要です。ビルドスクリプトは `--use-port=emdawnwebgpu` を渡し、
初回利用時に自動でダウンロードしてキャッシュします。

emsdk 同梱の emdawnwebgpu（`v20250531.224602`）には、新しめの llama.cpp が使う
Dawn 固有型のいくつかが不足しています
（`DawnTogglesDescriptor`、`SubgroupMatrixConfig`、
`InstanceFeatureName::TimedWaitAny`、
`FeatureName::ImplicitDeviceSynchronization`）。この fork では
`ggml-webgpu.cpp` 内で `#ifndef __EMSCRIPTEN__` によってガードしています。
詳細は **セクション 5** を参照してください。

### E2E テスト

ビルド後は Playwright で検証します。

```bash
# 既存 6 バリアントのリグレッション確認
npx playwright test tests/wasm-variant-verify.spec.ts --reporter=list

# Asyncify 検証（disabled: true 時は自動スキップ）
npx playwright test tests/webgpu-asyncify-verify.spec.ts --reporter=list
```

Asyncify 検証テストの OPFS ロードケースには実モデルファイルが必要です。
`smollm2-360m-instruct-q8_0.gguf` をスペックファイル内のパスに配置してください。
`disabled: true` の間は、モデルファイルがなくても両テストがスキップします。

## ビルド手順

> **主要フロー:** 通常の開発では以下の手動手順を実行する必要はありません。
> `scripts/wllama/build.sh`（適切な環境変数付き）がセットアップ・パッチ適用・
> WASM コンパイル・glue 埋め込み・成果物コピーをすべて自動処理します。
> 手動手順（1〜5）は、自動スクリプトをバイパスする必要がある場合や
> デバッグ時の参照用です。

### 手順 1: WASM バイナリをビルドする

```bash
cd vendor/wllama-src
./scripts/build_all_wasm.sh
```

`vendor/wllama-src/` は upstream ソースから作成する `gitignore` 対象のローカル
ワーキングツリーです。これは一度だけ `bash scripts/wllama/setup.sh` で準備します。
このスクリプトは wllama を clone し、`vendor/wllama-patches/` のパッチを適用します。

想定フロー:

1. `bash scripts/wllama/setup.sh` — upstream を `vendor/wllama-src/` に取得し、パッチを適用
2. `cd vendor/wllama-src && ./scripts/build_all_wasm.sh`

これにより `wasm/` 配下に 8 バリアントすべてが生成されます。

各ディレクトリの内容:
- `wllama.wasm` — WASM バイナリ
- `wllama.js` — Emscripten の JS glue（ランタイム + import 定義）

特定バリアントだけ再ビルドしたい場合は、引数としてバリアント名を渡します。

```bash
# vendor/wllama-src/ で実行
./scripts/build_all_wasm.sh \
  single-thread-webgpu \
  multi-thread-webgpu \
  single-thread-webgpu-compat \
  multi-thread-webgpu-compat
```

ベースとなる WebGPU バックエンドや、その JS glue のみを更新したいときは、
これが推奨される高速ルートです。

### 手順 2: 生成された JS glue にパッチを当てる（重要）

生成された glue を埋め込む前に、すべての `wasm/*/wllama.js` に対して
emsdk 4.x の heap-view 互換パッチを適用します。

このパッチは意図的に厳密です。`Module["HEAPU8"]=HEAPU8` が存在するかどうかだけを
見てはいけません。`Module` の直前にセミコロンが欠けると、次のような不正な
minify 済み JavaScript が生成されます。

```javascript
HEAPU64=new BigUint64Array(b)Module["HEAPU8"]=HEAPU8
```

また、すでにパッチ済みかどうかの判定を引用符の種類だけに依存してはいけません。
ツールによっては `Module["HEAPU8"]` を維持しますし、手作業のパッチでは
`Module['HEAPU8']` になることもあります。どちらも JavaScript として正しいため、
重要なのは次の点です。

- 代入が `updateMemoryViews()` の中にあること
- `HEAPU8` の代入後に置かれていること
- 直前の式と `;` で区切られていること
- `BigUint64Array(...)Module[...]` のように区切りがない形は検証で弾くこと

```bash
node <<'NODE'
const fs = require('fs');
// このリストは実際にビルドしたバリアントに合わせて調整してください。
// single-thread-webgpu / multi-thread-webgpu は upstream artifact なので
// upstream リリースから明示的にコピーした場合のみ含めてください。
const variants = [
  'single-thread-cpu-mem64',
  'multi-thread-cpu-mem64',
  'single-thread-cpu-compat',
  'multi-thread-cpu-compat',
  'single-thread-webgpu-compat',
  'multi-thread-webgpu-compat',
  // Asyncify バリアントをビルドした場合はコメントを外す:
  // 'single-thread-webgpu-asyncify-compat',
  // 'multi-thread-webgpu-asyncify-compat',
];

let changed = 0;
for (const variant of variants) {
  const path = `wasm/${variant}/wllama.js`;
  let code = fs.readFileSync(path, 'utf8');

  const validPatch = /;\s*Module\[['"]HEAPU8['"]\]\s*=\s*HEAPU8/.test(code);
  const missingSemicolon = /BigUint64Array\((?:wasmMemory\.buffer|b)\)\s*Module\[['"]HEAPU8['"]\]/.test(code);
  if (missingSemicolon) {
    throw new Error(`${path} has an invalid missing semicolon before Module.HEAPU8`);
  }
  if (validPatch) {
    continue;
  }

  const before = code;
  code = code.replace(
    /(HEAPU64\s*=\s*new BigUint64Array\((?:wasmMemory\.buffer|b)\);?)(\s*})/,
    '$1;Module["HEAPU8"]=HEAPU8$2',
  );

  if (code === before) {
    throw new Error(`Could not patch ${path}: updateMemoryViews() shape changed`);
  }

  fs.writeFileSync(path, code);
  changed++;
}

console.log(`Patched HEAPU8 export in ${changed} file(s)`);
NODE
```

続いて、パッチを当てた glue ファイルすべてに適用されていることを確認します
（上と同じ variants リストを使用）。

```bash
node <<'NODE'
const fs = require('fs');
const variants = [
  'single-thread-cpu-mem64',
  'multi-thread-cpu-mem64',
  'single-thread-cpu-compat',
  'multi-thread-cpu-compat',
  'single-thread-webgpu-compat',
  'multi-thread-webgpu-compat',
  // 'single-thread-webgpu-asyncify-compat',
  // 'multi-thread-webgpu-asyncify-compat',
];

for (const variant of variants) {
  const path = `wasm/${variant}/wllama.js`;
  const code = fs.readFileSync(path, 'utf8');
  if (!/;\s*Module\[['"]HEAPU8['"]\]\s*=\s*HEAPU8/.test(code)) {
    throw new Error(`${path} does not expose Module.HEAPU8`);
  }
  if (/BigUint64Array\((?:wasmMemory\.buffer|b)\)\s*Module\[['"]HEAPU8['"]\]/.test(code)) {
    throw new Error(`${path} has an invalid missing semicolon before Module.HEAPU8`);
  }
}

console.log('OK: all glue variants expose Module.HEAPU8');
NODE
```

### 手順 3: JS glue をライブラリへ埋め込む（重要）

wllama ライブラリは Emscripten の JS glue を文字列定数として埋め込みます。
WASM を再ビルドしたら、**必ず**埋め込み済み glue も更新してください。

```bash
# vendor/wllama-src/ で実行
# 生成された JS glue の全バリアントを generated.ts に再埋め込み
npm run build:worker

# ライブラリを bundle
npm run build:tsup
```

**これが重要な理由:** WASM バイナリと JS glue は対になっています。glue 側が、
WASM バイナリが期待する import 関数（minify 後の `a`, `b`, `c`... など）を
正確に定義しているためです。新しい WASM バイナリだけを配布して、埋め込み済みの
JS glue を更新しないと、`WebAssembly.instantiate()` は次のエラーで失敗します。

```text
Import #0 "a": module is not an object or function
```

埋め込まれた bundle に必要なランタイムパッチが残っているかも確認します
（`vendor/wllama-src/` で実行）。

```bash
node <<'NODE'
const fs = require('fs');
const code = fs.readFileSync('esm/index.js', 'utf8');

if (!/;\s*Module\[['"]HEAPU8['"]\]\s*=\s*HEAPU8/.test(code)) {
  throw new Error('esm/index.js does not contain the Module.HEAPU8 patch');
}

if (/BigUint64Array\((?:wasmMemory\.buffer|b)\)\s*Module\[['"]HEAPU8['"]\]/.test(code)) {
  throw new Error('esm/index.js contains an invalid missing semicolon before Module.HEAPU8');
}

if (!code.includes('WebAssembly.Suspending')) {
  throw new Error('esm/index.js does not contain JSPI support for WebGPU glue');
}

if (code.includes('_emscripten_has_asyncify=()=>0')) {
  throw new Error('esm/index.js still contains asyncify=0 glue');
}

console.log('OK: embedded glue includes HEAPU8 export and JSPI WebGPU support');
NODE
```

### 手順 4: 成果物をメインプロジェクトへコピーする

> **主要フローでは自動処理されます** — `scripts/wllama/build.sh` に
> `WLLAMA_SYNC_VENDOR_JS=1` を付けると WASM バイナリと glue ファイルの
> 両方が自動コピーされます。以下は手動でビルドした場合の参考手順です。

`vendor/wllama-src/` から実行します（リポジトリルートの 1 階層内側）。

```bash
# WASM バイナリ — 各バリアントのビルドディレクトリからコピー
cp wasm/single-thread-cpu-mem64/wllama.wasm    ../vendor/wllama/single-thread-cpu-mem64.wasm
cp wasm/multi-thread-cpu-mem64/wllama.wasm     ../vendor/wllama/multi-thread-cpu-mem64.wasm
cp wasm/single-thread-cpu-compat/wllama.wasm   ../vendor/wllama/single-thread-cpu-compat.wasm
cp wasm/multi-thread-cpu-compat/wllama.wasm    ../vendor/wllama/multi-thread-cpu-compat.wasm
cp wasm/single-thread-webgpu-compat/wllama.wasm  ../vendor/wllama/single-thread-webgpu-compat.wasm
cp wasm/multi-thread-webgpu-compat/wllama.wasm   ../vendor/wllama/multi-thread-webgpu-compat.wasm
# Asyncify（ビルドした場合）:
# cp wasm/single-thread-webgpu-asyncify-compat/wllama.wasm  ../vendor/wllama/single-thread-webgpu-asyncify-compat.wasm
# cp wasm/multi-thread-webgpu-asyncify-compat/wllama.wasm   ../vendor/wllama/multi-thread-webgpu-asyncify-compat.wasm

# 注意: single-thread-webgpu.wasm / multi-thread-webgpu.wasm（Memory64 + JSPI）は
# upstream artifact なので、ローカルビルド出力からコピーしないでください。

# JS glue バンドル — 手動コピーは複雑（各バリアントのビルドが独立した
# esm/index.js を生成し、コピー時にリネームされる）。
# esm/mem64.js のようなファイルは存在しません。
# 手動コピーが必要な場合は build-local.sh の WLLAMA_SYNC_VENDOR_JS ブロックを参照:
#   grep -n "SYNC_VENDOR_JS\|cp esm" vendor/wllama/lowbit-q/build-local.sh
```

### 手順 5: メインプロジェクトへコピーした内容を検証する

コピー後に `vendor/wllama-src/` から次のチェックを実行します。

```bash
node <<'NODE'
const fs = require('fs');
// 実際にビルドしてコピーしたペアに合わせて調整してください。
// single-thread-webgpu / multi-thread-webgpu は upstream artifact なので含めません。
const wasmPairs = [
  ['wasm/single-thread-cpu-mem64/wllama.wasm',   '../vendor/wllama/single-thread-cpu-mem64.wasm'],
  ['wasm/multi-thread-cpu-mem64/wllama.wasm',    '../vendor/wllama/multi-thread-cpu-mem64.wasm'],
  ['wasm/single-thread-cpu-compat/wllama.wasm',  '../vendor/wllama/single-thread-cpu-compat.wasm'],
  ['wasm/multi-thread-cpu-compat/wllama.wasm',   '../vendor/wllama/multi-thread-cpu-compat.wasm'],
  ['wasm/single-thread-webgpu-compat/wllama.wasm', '../vendor/wllama/single-thread-webgpu-compat.wasm'],
  ['wasm/multi-thread-webgpu-compat/wllama.wasm',  '../vendor/wllama/multi-thread-webgpu-compat.wasm'],
  // Asyncify バリアントをビルド・コピーした場合はコメントを外す:
  // ['wasm/single-thread-webgpu-asyncify-compat/wllama.wasm', '../vendor/wllama/single-thread-webgpu-asyncify-compat.wasm'],
  // ['wasm/multi-thread-webgpu-asyncify-compat/wllama.wasm',  '../vendor/wllama/multi-thread-webgpu-asyncify-compat.wasm'],
];

for (const [src, dst] of wasmPairs) {
  const a = fs.readFileSync(src);
  const b = fs.readFileSync(dst);
  if (!a.equals(b)) {
    throw new Error(`${dst} is not the current build output from ${src}`);
  }
}

// JS glue の整合性確認:
// 各 glue ファイルは別々のビルドディレクトリで生成された esm/index.js を
// リネームしてコピーしたものです。単一の vendor/wllama-src/ から比較する
// ことは意味がありません。代わりに次を使用してください:
//   node scripts/wllama/verify-glue-exports.mjs

console.log('OK: vendored WASM artifacts match the current build');
NODE
```

## 既知の落とし穴

### 1. WASM と JS glue は必ず一致していなければならない

もっとも起きやすい失敗です。各 WASM バイナリには、それに対応する `.js` ファイルがあり、
一致した import 関数定義を持っています。片方だけ更新すると、実行時の WASM
初期化で失敗します。

**ルール:** 手順 1（WASM ビルド）のあとには、必ず手順 2（glue のパッチ）と
手順 3（埋め込み + bundle）を実行してください。

### 2. 各ランタイムバリアントにはそれぞれ専用の JS glue が必要

このリポジトリでは **4 種類の JS glue バンドル**を使います（WASM ファイルごとではなく
実行モードごとに 1 つ。single-thread と multi-thread の同モード WASM は同じ glue を共有）。
- `index.js` — CPU compat（wasm32、WebGPU なし）
- `mem64-index.js` — CPU Memory64
- `webgpu-index.js` — WebGPU + JSPI compat
- `webgpu-asyncify-index.js` — WebGPU + Asyncify compat（experimental）

Memory64 用 glue は 64-bit ポインタ変換を使い、Memory64 の WASM メモリを生成します。
compat 用 glue は 32-bit ポインタ変換を使い、通常の WASM メモリを生成します。
WebGPU 用 glue はこれに加えて Dawn/WebGPU 用の import 関数も含みます。異なる
バリアントの glue で WASM を読み込むと、初期化時または後続処理で失敗します。

**現状:** `src/vendor/wllama/index.js` は、選択された WASM ファイル名に応じて
埋め込み済み glue を切り替えます。`src/workers/wllamaWorker.ts` は、ブラウザ能力に
応じて使用する WASM ファイルを選びます。
- ローカルモデル設定で許可され、`requestAdapter()` と
  `requestDevice({ requiredFeatures: ['shader-f16'] })` が成功した場合に WebGPU を使う。
  それでも llama.cpp が WebGPU モデル読み込み中に abort した場合、ランタイムは worker
  を作り直して CPU WASM で再試行する
- モデルファイルが 2 GiB 以上で、かつ最小の Memory64 WASM モジュールが compile できる
  場合にのみ Memory64 を使う。小さいモデルでは、不要な端末での Memory64 固有問題を避けるため
  compat ビルドを使う
- `SharedArrayBuffer` と `crossOriginIsolated` が利用可能な場合にのみ multi-thread を使う

### 3. emsdk のバージョンは揃っていなければならない

すべての WASM バリアントと JS glue は、**同じ emsdk バージョン**でビルドする必要があります。
バージョンが違うと、互換性のない import テーブルやランタイムコードが生成されることがあります。

### 4. ビルドスクリプトでのシェルクォート

`build_worker.sh` は Node.js の `JSON.stringify()` を使って、JS glue コードを
文字列リテラルとして `generated.ts` に埋め込みます。これにより **ダブルクォート**
の JSON 文字列が生成されます。
- バックスラッシュとダブルクォートはエスケープされる
- **シングルクォートはエスケープされない**

`tsup` が `generated.ts` を bundle するとき、文字列区切りがダブルクォートから
シングルクォートに変換されることがあります。埋め込まれたコードに未エスケープの
シングルクォートが含まれていると、文字列が途中で切れてライブラリが壊れます。

現在の Emscripten 出力ではシングルクォートはごく少数しかないため、まだ問題に
なっていません。ただし、ビルドパイプラインを変更したり Emscripten を上げたりして、
埋め込みコードが途中で切れているようなら次を確認してください。

- `build_worker.sh` が内容を正しくエスケープしているか
- `generated.ts` を通常の文字列リテラルではなくテンプレートリテラル（バッククォート）
  に切り替えることを検討する
- 埋め込み文字列の長さが元ファイルと一致するか確認する
  ```bash
  node -e "
    const gen = require('fs').readFileSync('src/workers-code/generated.ts','utf8');
    const m = gen.match(/WLLAMA_SINGLE_THREAD_CODE = \"((?:[^\"\\\\]|\\\\.)*)\"/);
    const src = require('fs').readFileSync('src/single-thread/wllama.js','utf8');
    console.log('embedded:', m[1].length, 'source:', src.length);
  "
  ```

### 5. WebGPU ビルド用パッチ（ggml-webgpu.cpp）

llama.cpp の `ggml-webgpu.cpp` は、emsdk 4.0.10/4.0.14 に同梱された
emdawnwebgpu パッケージ（`v20250531.224602`）には存在しない Dawn 固有 API を使います。
この fork ではそれらを `#ifndef __EMSCRIPTEN__` でガードしています。

**ggml-webgpu.cpp でガードしている API:**

| API | 理由 | 対応 |
|-----|--------|--------|
| `wgpu::DawnTogglesDescriptor` | Dawn 固有の toggle 型で、emdawnwebgpu にはない | `#ifndef __EMSCRIPTEN__`（adapter, device, instance setup の 3 箇所） |
| `wgpu::SubgroupMatrixConfig`（struct member） | emdawnwebgpu パッケージにない | struct 定義で `#ifndef __EMSCRIPTEN__` |
| `wgpu::AdapterPropertiesSubgroupMatrixConfigs` | emdawnwebgpu パッケージにない | adapter info block で `#ifndef __EMSCRIPTEN__` |
| `wgpu::FeatureName::ChromiumExperimentalSubgroupMatrix` | Chrome 固有で、emdawnwebgpu にない | `#ifndef __EMSCRIPTEN__` |
| `wgpu::FeatureName::ImplicitDeviceSynchronization` | emdawnwebgpu にない | EMSCRIPTEN 時は `required_features` から除外 |
| `wgpu::InstanceFeatureName::TimedWaitAny` | emdawnwebgpu にない | instance setup で `#ifndef __EMSCRIPTEN__` |
| `OnSubmittedWorkDone` callback signature | emdawnwebgpu は `(status)`、新しめの Dawn は `(status, StringView)` を取る | 1 引数ラムダを使う `#ifdef __EMSCRIPTEN__` |
| `uint`（素の型名） | GCC 拡張であり、標準 C++ ではない | `uint32_t` に置換 |

加えて、`ggml-webgpu/` 配下の `CMakeLists.txt` には、`EMDAWNWEBGPU_DIR` が空のとき
`--use-port=emdawnwebgpu`（built-in）を使うパッチが入り、`target_link_options`
は `PRIVATE` から `INTERFACE` へ変更されています。これは port フラグを最終的な
linker 呼び出しまで伝播させるためです。

`llama.cpp` の submodule を更新したら、新しい `ggml-webgpu.cpp` でもこれらの箇所を
再確認してください。Dawn API の変更により、追加または削除される可能性があります。

wllama ラッパーは `LoadModelConfig.n_gpu_layers` も `glue_msg_load_req` に渡す必要があります。
upstream のラッパーは以前、常に `n_gpu_layers: 0` を送っていました。WebGPU ビルドでは、
これによりアプリケーションが GPU レイヤー offload を要求しても黙って無効化されます。

モデル読み込み進捗には 2 種類あります。TypeScript の worker ラッパーは、`Blob` を
Emscripten FS に流し込む間のファイルコピー進捗を出します。

```text
wllama-file-stage:<stage>
wllama-file-progress:<percent> name=<file> offset=<bytes> size=<bytes>
```

ネイティブ側の llama.cpp 読み込み進捗は、`cpp/actions.hpp` の
`llama_model_params.progress_callback` から出ます。

```text
@@INFO@@wllama-load-stage:<stage>
@@INFO@@wllama-load-progress:<percent>
```

アプリケーション worker は、ファイルコピー進捗を UI の初期進捗範囲に、
llama.cpp の tensor 読み込み進捗を native-load 範囲に割り当てます。heartbeat は、
バックエンドが止まっている間に適当な進捗を作るのではなく、最新の実測カウンタ
（`fileCopy` と `native`）を報告しなければなりません。debug view に native progress
が見えない場合は、配布中の WebGPU WASM にこれらの文字列が入っているか確認してください。

```bash
strings vendor/wllama/single-thread-webgpu-compat.wasm | rg 'wllama-load-stage|wllama-load-progress'
```

### 6. emsdk 4.x: HEAPU8 が Module オブジェクトに export されない

emsdk 4.0.x では、Emscripten は heap view（HEAPU8, HEAP32 など）を `Module`
オブジェクトのプロパティとして公開しません。これらは `updateMemoryViews()` によって
更新されるクロージャローカル変数です。wllama の worker コード（`llama-cpp.js`）は
`Module.HEAPU8` にアクセスするため、次のエラーで失敗します。

```text
TypeError: Cannot read properties of undefined (reading 'set')
```

**この fork での対処:** 埋め込み前に、生成された各 `wasm/*/wllama.js` に対して
`updateMemoryViews()` の末尾へ `Module["HEAPU8"]=HEAPU8` を追加します。

```javascript
// updateMemoryViews() の閉じ波括弧の直前:
HEAPU64=new BigUint64Array(b);Module["HEAPU8"]=HEAPU8}
```

`Module` の前のセミコロンは必須です。Emscripten の glue は強く minify されており、
`HEAPU64=new BigUint64Array(b)` の末尾にセミコロンが入る保証はありません。
単純に `Module["HEAPU8"]=HEAPU8` を挿入するだけだと、次のような不正な JavaScript
になることがあります。

```javascript
// 壊れた例:
HEAPU64=new BigUint64Array(b)Module["HEAPU8"]=HEAPU8}
```

そのため検証では、`HEAPU8` の存在だけでなく構文の形も確認する必要があります。
`/;\s*Module\[['"]HEAPU8['"]\]\s*=\s*HEAPU8/` のように引用符に依存しない正規表現を使い、
`/BigUint64Array\((?:wasmMemory\.buffer|b)\)\s*Module\[['"]HEAPU8['"]\]/`
の形は拒否してください。`Module["HEAPU8"]` と `Module['HEAPU8']` は JavaScript
として同じ意味ですが、単純な `includes('Module["HEAPU8"]=HEAPU8')` 判定では、
シングルクォート版を見逃し、さらに構文的に壊れたダブルクォート版も見落とします。

**この対応が必要になる場面:** 新しい WASM ビルドから JS glue を更新するたびに、
`npm run build:worker` の前にこのパッチを再適用してください。

### 7. emsdk 4.x + Memory64: cwrap のポインタ型は `'pointer'` にする

emsdk 4.0.x で Memory64（`-sMEMORY64=1`）を使うと、WASM のポインタ引数は
i64（BigInt）になります。Emscripten の `cwrap` は、引数がすべて数値型だと型変換を
省略するため、JS の Number で WASM 関数を呼ぶと次のエラーになります。

```text
TypeError: Cannot convert 179 to a BigInt
```

**この fork での対処:** `src/workers-code/llama-cpp.js` では、cwrap 呼び出しの
WASM ポインタ引数に `'number'` ではなく `'pointer'` を使っています。これにより
`ccall` 経路（いずれかの引数型が `'pointer'` のときに使われる）が有効になり、
BigInt 変換が行われます。`wllama_malloc` のダミー `uint32_t` のような非ポインタ引数は、
引き続き `'number'` のままにしてください。

```javascript
// 修正前（Memory64 で壊れる）
const pointer = 'number';
wllamaMalloc = callWrapper('wllama_malloc', pointer, ['number', pointer]);

// 修正後（Memory64 対応）
const pointer = 'pointer';
wllamaMalloc = callWrapper('wllama_malloc', pointer, [pointer, 'number']);
```

**この対応が必要になる場面:** 影響するのは Memory64 ビルド
（`single-thread-cpu-mem64.wasm`, `multi-thread-cpu-mem64.wasm`）のみです。compat ビルド
（`*-compat.wasm`）は 32-bit ポインタなので `'number'` でも動きますが、
`'pointer'` は両方に対して安全です。

### 8. WebGPU port では cmake と EMCC_CFLAGS を使い分ける

emdawnwebgpu 用の `--use-port=` フラグは `EMCC_CFLAGS` ではなく
`CMAKE_EXE_LINKER_FLAGS` から渡す必要があります。両方で渡すと
"duplicate port name" エラーになります。`build_all_wasm.sh` は次の形で
正しく扱っています。
- `emcmake cmake` の configure 時には `EMCC_CFLAGS=""` を設定する
- WebGPU ビルドでは `-DCMAKE_EXE_LINKER_FLAGS` 経由で `--use-port=` を渡す
- それ以外のフラグを含む `EMCC_CFLAGS` は `emmake make` 実行時にだけ設定する

### 9. WebGPU には JSPI または Asyncify が必要（TimedWaitAny のため）

`ggml-webgpu.cpp` は次のようにして WebGPU instance を作成します。

```cpp
std::vector<wgpu::InstanceFeatureName> instance_features = {
  wgpu::InstanceFeatureName::TimedWaitAny,
};
```

emdawnwebgpu 実装は、`TimedWaitAny` を Asyncify または JSPI が有効な場合に限って
許可します。どちらも有効でない状態で WebGPU ビルドを作ると、生成された glue には
次のコードが入り、

```javascript
_emscripten_has_asyncify=()=>0
```

`wgpuCreateInstance()` はアダプタ選択開始前に null を返します。

**2 つのサポート方式:**

**A) JSPI** (`-sJSPI=1`、`*-webgpu-compat.wasm` で使用): `WLLAMA_BUILD_WEBGPU=1` が生成する
WebGPU compat バリアントで使います。JSPI 対応ブラウザ（Chrome 117+）が必要です。
Firefox・Safari では現時点（emsdk 5.0.x）では未対応。

**B) Asyncify** (`-sASYNCIFY=1`、`*-webgpu-asyncify-compat.wasm` で使用): `WLLAMA_BUILD_WEBGPU_ASYNCIFY=1` が生成する Asyncify WebGPU バリアントで使います。
**Asyncify は `-fwasm-exceptions` と非互換**です（Binaryen の Asyncify pass が
native EH ブロックをインストルメントできない）。対処として、Asyncify ビルドは
`SHARED_EMCC_CFLAGS_ASYNCIFY_BASE` から `-fwasm-exceptions` を除去し、
Emscripten の JS ベース例外ハンドリングを使います。JSPI/CPU バリアントとは
例外 ABI が異なりますが、GPU オフロードがコストを支配するため許容範囲です。
さらに以下も必要です。
- `-sASSERTIONS=1`: `MINIFY_WASM_IMPORTS_AND_EXPORTS` を無効化するために必要。
  これがないと `asyncify_start_unwind` が WASM 内でリネームされても JS 側が
  更新されず `TypeError: _asyncify_start_unwind is not a function` が発生する。
- `-sIMPORTED_MEMORY`: emdawnwebgpu が imported memory を要求するため必要。
  Asyncify ビルドでは JSPI ビルドと異なり自動設定されない。

いずれのバリアントを再ビルドした後も、生成された WebGPU glue に
`_emscripten_has_asyncify=()=>0` が残っていないことを確認してください。

### 10. `Module._wllama_*` を直接呼ぶ。`cwrap` は使わない。Asyncify には `_callWasm` が必要

内部 worker（`llama-cpp.js`）は、5 つの wllama export を
`Module.cwrap()` / `ccall()` 経由ではなく、`Module._wllama_*` で直接呼びます。

`applySignatureConversions`（`build_all_wasm.sh` でパッチされる）は、CPU および
JSPI WebGPU バリアントの各 `Module._wllama_*` export を正規化しており、次を保証します。

- 入力は plain な JS Number を受け取れる（JS 側で手作業の BigInt 変換は不要）
- 戻り値は plain な JS Number（または JSPI export では `Promise<Number>`）

CPU・JSPI バリアントでは単一の `await` + `Number()` 呼び出しが動きます。

```javascript
wllamaMalloc = async (size, dummy) => Number(await Module._wllama_malloc(size, dummy));
wllamaStart  = async () => Number(await Module._wllama_start());
// etc.
```

**Asyncify バリアントは異なる呼び出し規約が必要です。** `-sASYNCIFY=1` では、
`Module._wllama_action(...)` は**同期的に返ります**（WASM 内部で unwind/rewind が発生）。
実際の非同期結果は `Module['Asyncify'].whenDone()` 経由で取得しますが、呼び出し後に
`Module['Asyncify'].currData !== null` の場合のみです（サスペンションが実際に発生した場合）。
`currData` が null の場合は関数が同期的に完了しており、戻り値をそのまま使えます。

`llama-cpp.js` は `_callWasm` ヘルパーで 3 パターンを統一しています。

```javascript
const _isAsyncify = typeof Module['Asyncify'] !== 'undefined'
  && typeof Module['Asyncify'].whenDone === 'function';

const _callWasm = _isAsyncify
  ? async (fn, ...args) => {
      const syncResult = fn(...args);
      if (Module['Asyncify'].currData !== null) {
        return Module['Asyncify'].whenDone();
      }
      return syncResult;
    }
  : async (fn, ...args) => fn(...args);  // CPU / JSPI: await で十分

// 全バリアントで統一的に使用:
wllamaMalloc = async (size, dummy) =>
  _fromWasmAddr(await _callWasm(Module._wllama_malloc, _toWasmAddr(size), dummy));
wllamaStart  = async () => ptrToString(await _callWasm(Module._wllama_start));
// etc.
```

**`whenDone()` を無条件で呼んではいけません。** wllama 関数が同期的に完了した場合
（GPU 呼び出しなしで完了する Asyncify ビルドでよくある）、`whenDone()` は
_"Tried to wait for an async operation when none is in progress"_ で失敗します。

**なぜ cwrap を使わないのか:** `cwrap` / `ccall` には Memory64+WebGPU の組み合わせで
だけ起きる async 判定バグがあります。`wllama_malloc` が
`applySignatureConversions` により `Promise.resolve(...).then(Number)` で包まれると、
戻り値は `Promise` になります。しかし `ccall` は `{async:true}` なしでは
`Number(Promise)` を同期的に呼んで NaN を返します。その NaN が `wllama_action`
へのポインタ引数として伝播し、`BigInt(NaN)` で例外になります。`cwrap` を経由しなければ、
この種の問題を避けられます。

**この対応が必要になる場面:** wllama export の呼び出し方を変更するときです。
8 バリアントすべての async/sync 経路を監査しない限り、`cwrap` を再導入してはいけません。

### 11. Memory64 glue では独自の `wllama_*` i64 export も wrap する必要がある

`MEMORY64=1` ビルドでは、Emscripten は `applySignatureConversions(...)` を生成し、
JavaScript から一部の i64 export を plain な Number で呼べるようにします。ただし、
生成された helper は独自の `wllama_*` export を自動では含みません。

この fork の `build_all_wasm.sh` は、すべての Memory64 バリアントについて、
生成された glue の `applySignatureConversions` を拡張するパッチを入れます。

**Memory64 + WebGPU（JSPI）** — `wllama_start/action/exit/debug` は JSPI で wrap されて
おり `Promise<BigInt>` を返します。これらには async wrapper を使います。
一方、`wllama_malloc` は JSPI export ではなく、同期的に `BigInt` を返すので、
*同期* wrapper を使います。

```javascript
// sync — wllama_malloc は JSPI export ではない
var makeWrapper_pi64i32 = f => (a0,a1) => Number(f(BigInt(a0),a1));
// async — wllama_start/exit/debug は Promise<BigInt> を返す JSPI export
var makeWrapper_p_async  = f => () => Promise.resolve(f()).then(v=>Number(v));
// async — wllama_action は Promise<BigInt> を返す JSPI export
var makeWrapper_pi64i64  = f => (a0,a1) => Promise.resolve(f(BigInt(a0),BigInt(a1))).then(v=>Number(v));

wasmExports["wllama_malloc"] = makeWrapper_pi64i32(wasmExports["wllama_malloc"]);
wasmExports["wllama_start"]  = makeWrapper_p_async(wasmExports["wllama_start"]);
wasmExports["wllama_action"] = makeWrapper_pi64i64(wasmExports["wllama_action"]);
wasmExports["wllama_exit"]   = makeWrapper_p_async(wasmExports["wllama_exit"]);
wasmExports["wllama_debug"]  = makeWrapper_p_async(wasmExports["wllama_debug"]);
```

**Memory64 非 WebGPU（JSPI なし）** — export は minify 名
（例: `"x"`, `"y"`, `"z"`, `"A"`, `"B"`）を使います。ビルドスクリプトは
`assignWasmExports()` からこれらの名前を抽出し、同期 wrapper を挿入します。

```javascript
var makeWrapper_pi64i32_sync = f => (a0,a1) => Number(f(BigInt(a0),a1));
var makeWrapper_pi64i64_sync = f => (a0,a1) => Number(f(BigInt(a0),BigInt(a1)));

wasmExports["x"] = makeWrapper_pi64i32_sync(wasmExports["x"]);  // wllama_malloc
wasmExports["y"] = makeWrapper_p(wasmExports["y"]);              // wllama_start
wasmExports["z"] = makeWrapper_pi64i64_sync(wasmExports["z"]);  // wllama_action
wasmExports["A"] = makeWrapper_p(wasmExports["A"]);              // wllama_exit
wasmExports["B"] = makeWrapper_p(wasmExports["B"]);              // wllama_debug
```

（実際の minify 名はビルド時に検出され、emsdk のバージョンや llama.cpp submodule 更新で
変わる可能性があります。）

**compat WebGPU（32-bit + JSPI）** — 新しめの emsdk（4.0.x で確認）では、compat
WebGPU ビルドでも `applySignatureConversions` が生成されます。ここでは **i32 wrapper**
（plain な Number）を使う必要があります。BigInt wrapper を使ってはいけません。
`patch_emscripten_jspi_exports` 関数は第 2 引数を受け取ります。

```bash
# compat WebGPU — i32 wrapper
patch_emscripten_jspi_exports wllama.js false

# Memory64 WebGPU — i64/BigInt wrapper
patch_emscripten_jspi_exports wllama.js true
```

compat WebGPU で挿入される helper:

```javascript
// wllama_malloc(i32 size, i32 dummy)->i32: sync, 既存の makeWrapper_ppp を使う
wasmExports["wllama_malloc"] = makeWrapper_ppp(wasmExports["wllama_malloc"]);
// wllama_start/exit/debug ()->i32: JSPI async, 引数なし
var makeWrapper_p_async      = f => () => Promise.resolve(f()).then(v=>v>>>0);
// wllama_action(i32,i32)->i32: JSPI async, 2 つの i32 引数
var makeWrapper_pi32i32_async = f => (a0,a1) => Promise.resolve(f(a0,a1)).then(v=>v>>>0);
```

32-bit の WASM ビルドに BigInt wrapper を入れると、最初の `wllama_action` 呼び出しで
次のエラーになります。

```text
TypeError: Cannot convert a BigInt value to a number
```

**compat 非 WebGPU（32-bit, JSPI なし）** — 追加の injection は不要です。export は
もともと 32-bit Number をそのまま受け取り、返します。

**この対応が必要になる場面:** `build_all_wasm.sh` の実行ごとに自動で再適用されます。
emsdk を上げたり llama.cpp を更新したりして `wllama_malloc` や `wllama_action` から
BigInt / NaN エラーが出たら、パッチがまだ適用されているか確認してください
（生成された glue に `makeWrapper_p` マーカーが存在する必要があります）。

### 12. emsdk 4.0.x で `makeWrapper_p` のマーカー文字列が変わった

`applySignatureConversions` は以前は次のように生成されていました。

```javascript
var makeWrapper_p=f=>()=>Number(f());
```

新しめの emsdk では次の形になります。

```javascript
var makeWrapper_p=f=>()=>f()>>>0;
```

32-bit 値に対しては、どちらも機能的には同じです。ビルドスクリプトは `next()` で
両方を試すため、emsdk の違いがあってもビルドが通ります。

```python
marker = next(
    (s for s in ('var makeWrapper_p=f=>()=>f()>>>0;',
                 'var makeWrapper_p=f=>()=>Number(f());') if s in body),
    None)
if marker is None:
    raise SystemExit(f"ERROR: makeWrapper_p marker not found in {path}")
```

**この対応が必要になる場面:** emsdk 更新後に
`ERROR: makeWrapper_p marker not found` が出たら、新しい文字列形式を上の tuple に
追加してください。

### 13. WebGPU の set_rows で error buffer pool が枯渇する

生成中、`ggml_backend_webgpu_submit()` は `MapAsync(AllowSpontaneous)` により
error-check buffer を非同期に map します。Emscripten ビルドではこの callback が
一貫して次のエラーで失敗します。

```text
ggml_webgpu: Failed to map error buffer: Buffer was destroyed before mapping was resolved.
```

修正がないと、`MapAsync` の失敗ごとに `set_rows_error_buf_pool`
（固定長 32 スロット）から 1 スロットずつ失われます。32 回失敗すると pool が空になり、
`alloc_bufs()` は `cv.wait()` を呼びます。single-thread の Emscripten ではこれが
busy-spin になり、ブラウザタブが無限に固まります。

**この fork での対処（Step 3-A）:** `MapAsync` が失敗した場合、callback は
`ggml_webgpu_create_buffer()` を使って新しい buffer の組を作り、pool へ戻します。
これにより callback が何回失敗しても pool を満たしたままにできます。

```cpp
if (status != wgpu::MapAsyncStatus::Success) {
    GGML_LOG_ERROR("ggml_webgpu: Failed to map error buffer: %s\n", ...);
    webgpu_pool_bufs new_bufs;
    ggml_webgpu_create_buffer(ctx->device, new_bufs.dev_buf, ...);
    ggml_webgpu_create_buffer(ctx->device, new_bufs.host_buf, ...);
    ctx->set_rows_error_buf_pool.free_bufs({ new_bufs });
}
```

失敗した buffer は、map 中断後の状態が未定義なので unmap や返却はせず、そのまま破棄します。

**この対応が必要になる場面:** 生成フェーズに達するすべての WebGPU ビルドです。
このパッチは `build_all_wasm.sh` の `apply_fork_compat_patches()` により自動適用されます。
llama.cpp submodule を更新してパッチが当たらなくなったら、
`ggml_backend_webgpu_submit()` の元の `MapAsync` ループが、スクリプト内の `old` 文字列と
まだ一致しているか確認してください。
