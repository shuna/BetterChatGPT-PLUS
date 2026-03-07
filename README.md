# BetterChatGPT-PLUS

## English

This repository is a fork of [BetterChatGPT-PLUS](https://github.com/animalnots/BetterChatGPT-PLUS), which itself is based on [BetterChatGPT](https://github.com/ztjhz/BetterChatGPT).  
The repository name is still `BetterChatGPT-PLUS` for now, but it is planned to be changed later.

### About BetterChatGPT

BetterChatGPT is an open-source web client that provides a ChatGPT-like conversational experience using the OpenAI API.  
It includes features such as multi-chat management, model switching, message editing, saving, and synchronization.

### Main Changes Merged into This Fork

Below is a summary organized from the pull requests that have been merged into this fork so far.

#### Major Changes

- Added a Visual Branch Editor for handling conversation branches visually
- Added an action to regenerate only the next response after edits made in the middle of a conversation
- Added UI and related logic to regenerate from every conversation bubble
- Added multi-conversation view to the Branch Editor
- Added collapsible message bubbles and improved the related interaction UI
- Added an ON/OFF toggle for streaming responses to model settings
- Added Service Worker-based background stream recovery
- Added PWA support
- Introduced transparent `lz-string` compression to improve localStorage / Google Drive persistence efficiency
- Introduced ContentStore-based deduplication for message content to reduce storage usage
- Implemented large-scale performance improvements around initial rendering, editing, chat switching, and collapsed-message handling

#### Minor Changes

- Added a toggle for ShareGPT button visibility
- Cleaned up the visibility of About / Author related menus
- Improved feedback when saving provider API keys
- Improved silent refresh behavior for Google Drive
- Improved token cost display with provider-aware pricing support
- Added inline model switching in the chat header
- Consolidated model option display into a single button
- Reworked the toolbar row layout to unify model selection and view controls
- Improved the placement and consistency of branch switching actions and message actions
- Preserved scroll position and the selected branch when switching views
- Improved the collapse UI and responsive tab bar
- Reorganized the API settings screen and consolidated it into AI Provider settings
- Added a branch-only button to separate branching behavior
- Changed chat duplication so the duplicated chat is selected immediately
- Improved iOS status-bar tap-to-scroll-to-top behavior
- Added missing Japanese locale files

#### Other Bug Fixes

- Fixed multibyte character decoding issues during streaming
- Rewrote the SSE parser to fix corrupted streaming responses
- Fixed the inconsistency where favorite model definitions were missing `contextLength`
- Fixed an issue where the max token slider was incorrectly clamped to 100
- Fixed JSON import so it can handle unrecognized model IDs
- Fixed drag conflicts while renaming chats
- Fixed branch synchronization issues during message edit and submit flows
- Fixed branch tree synchronization issues when deleting messages
- Fixed the add message button being partially hidden by the next message
- Fixed streaming support detection and Firefox-specific update handling
- Prevented redundant persisted settings updates
- Reduced the cost of persisting collapsed state
- Reduced unnecessary re-renders
- Refactored shared regenerate logic to improve the stability of related actions

### Development

#### Run Locally

```bash
yarn
yarn dev
```

or

```bash
npm install
npm run dev
```

#### Build

```bash
yarn build
```

### Acknowledgements

Deep thanks to the authors and contributors of [BetterChatGPT](https://github.com/ztjhz/BetterChatGPT), which provided the starting point for this project.  
This fork was able to accumulate its improvements because of the excellent foundation they created for extending a local-first ChatGPT-like experience.

We also sincerely thank the authors and contributors of [BetterChatGPT-PLUS](https://github.com/animalnots/BetterChatGPT-PLUS), who added many practical extensions.  
This repository inherits those improvements while continuing to improve operations, refine the UI, strengthen branch-editing features, and improve performance.

---

## 日本語

このリポジトリは、[BetterChatGPT](https://github.com/ztjhz/BetterChatGPT) をベースにした [BetterChatGPT-PLUS](https://github.com/animalnots/BetterChatGPT-PLUS) をさらにフォークしたプロジェクトです。  
現時点ではリポジトリ名はまだ `BetterChatGPT-PLUS` のままですが、今後修正予定です。

### BetterChatGPT について

BetterChatGPT は、OpenAI API を使って ChatGPT ライクな会話体験を提供するオープンソースの Web クライアントです。  
複数会話の管理、モデル切り替え、メッセージ編集、保存・同期などを備えています。

### このフォークで取り込んだ主な変更

以下は、本フォークでこれまでにマージしてきた PR をもとに整理した要約です。

#### 大きな変更

- 会話の分岐を視覚的に扱える Visual Branch Editor を追加
- 編集途中の文脈に対して「次だけ再生成」できる操作を追加
- すべての会話バブルから再生成できる UI と関連ロジックを追加
- Branch Editor に multi-conversation view を追加
- メッセージバブルの折りたたみ機能を追加し、操作 UI も改善
- ストリーミング応答の ON/OFF 切り替えをモデル設定に追加
- Service Worker を利用したバックグラウンドのストリーム復旧機能を追加
- PWA 対応を追加
- `lz-string` による透過圧縮を導入、localStorage / Google Drive 保存を効率化
- ContentStore によるメッセージ内容の重複排除を導入し、保存容量を削減
- 初期表示・編集・会話切り替え・折りたたみ周辺で大規模なパフォーマンス改善を実施

#### 小さな変更

- ShareGPT ボタンの表示切替を追加
- About / Author 系メニューの表示を整理
- Provider API Key 保存時のフィードバックを改善
- Google Drive のサイレントリフレッシュ挙動を改善
- プロバイダごとの料金表示に対応し、トークンコスト表示を改善
- チャットヘッダーにモデルのインライン切り替えを追加
- モデルオプション表示を 1 つのボタンに整理
- ツールバーの行構成を見直し、モデル選択とビュー操作を統合
- ブランチ切り替え操作とメッセージアクションの位置関係を改善
- ビュー切り替え時のスクロール位置と選択中ブランチを保持
- 折りたたみ UI とレスポンシブなタブバーを改善
- API 設定画面を整理し、AI Provider 設定へ統合
- branch-only ボタンを追加して分岐操作を分離
- 複製したチャットを複製直後に自動選択するよう変更
- iOS でステータスバータップによる最上部スクロールを改善
- 日本語ロケール不足分を追加

#### その他バグ修正

- ストリーミング時のマルチバイト文字デコード不具合を修正
- SSE パーサを書き直し、ストリーミング応答が壊れる問題を修正
- お気に入りモデル定義に `contextLength` が欠ける不整合を修正
- max token スライダーが不正に 100 へ丸め込まれる問題を修正
- JSON インポート時に未知のモデル ID を含んでいても取り込めるよう修正
- チャット名変更中にドラッグ操作が競合する問題を修正
- メッセージ編集・送信時の branch 同期不整合を修正
- メッセージ削除時の branch tree 同期不整合を修正
- add message ボタンが次のメッセージに隠れる問題を修正
- ストリーミング対応判定と Firefox 向けの更新処理を修正
- 設定保存時の不要な永続化更新を抑制
- 折りたたみ状態保存まわりのコストを削減
- 不要な再レンダリングを抑制
- 再生成処理の共通ロジックを整理し、関連操作の安定性を向上

### 開発

#### ローカル起動

```bash
yarn
yarn dev
```

または

```bash
npm install
npm run dev
```

#### ビルド

```bash
yarn build
```

### 謝辞

このプロジェクトの出発点となった [BetterChatGPT](https://github.com/ztjhz/BetterChatGPT) の作者・コントリビューターの皆様に深く感謝します。  
ChatGPT ライクな体験をローカル主導で拡張できる優れた土台があったからこそ、本フォークでの改善を積み重ねることができました。

また、数多くの実用的な拡張を加えた [BetterChatGPT-PLUS](https://github.com/animalnots/BetterChatGPT-PLUS) の作者・コントリビューターの皆様にも感謝します。  
本リポジトリはその成果を受け継ぎながら、さらに運用上の改善、UI 調整、分岐編集まわりの機能強化、パフォーマンス改善を継続している派生プロジェクトです。
