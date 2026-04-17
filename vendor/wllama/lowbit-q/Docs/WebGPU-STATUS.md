# WebGPU Status Note

最終更新: 2026-04-18

この文書は、`vendor/wllama/lowbit-q/` が本流 `wllama` の WebGPU 状況を正本として
扱わないことを明確にするための移行メモです。

## 位置づけ

`vendor/wllama/lowbit-q/` は独自フォーマット拡張と low-bit-q 推論専用のディレクトリです。
WebGPU 対応、Memory64、JSPI、OPFS、shard 対応などの「本流 `wllama` の拡張」は
ここでは管理しません。

本流 `wllama` 側のステータスは以下を参照してください。

- [`vendor/wllama/SpecAndStatus.md`](/Users/suzuki/weavelet-canvas/vendor/wllama/SpecAndStatus.md)
- [`vendor/wllama/BUILD.md`](/Users/suzuki/weavelet-canvas/vendor/wllama/BUILD.md)

## 旧記録について

このファイルに以前書かれていた WebGPU generate 失敗記録は、整理前の調査メモでした。
現在は low-bit-q 側の正本ではないため、将来の判断材料としては `vendor/wllama/`
側の文書を優先します。

## low-bit-q 側で WebGPU を扱う場合

low-bit-q 側で WebGPU を扱うのは、次のどちらかに限ります。

- 本流 `vendor/wllama` 拡張の上で low-bit-q がどう振る舞うか
- low-bit-q 独自フォーマットが WebGPU 経路へ与える追加影響

つまり「WebGPU 自体の安定化」は low-bit-q の責務ではなく、本流 `wllama`
拡張の責務です。
