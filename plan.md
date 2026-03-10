# インポート・エクスポート機能強化プラン

## 概要
AnythingLLM, Open WebUI, LM Studio, OpenRouter Chat, ChatGPT, Claude の6つのプラットフォームのチャットデータのインポート・エクスポートに対応する。

## 現状
- **インポート対応済み**: ExportV1/V2/V3 (自社形式), OpenAI/ChatGPT形式 (mapping tree), OpenAI Playground JSON
- **エクスポート対応済み**: V3 (Compact), V1 (Legacy), Markdown, PNG, 個別チャットJSON

## 各プラットフォームのフォーマット分析

### 1. ChatGPT (OpenAI)
- **インポート**: 既に対応済み (`mapping` tree構造)
- **エクスポート**: 未対応 → ChatGPT互換 `conversations.json` 形式のエクスポートを追加

### 2. Claude.ai
- **形式**: JSON配列、各会話に `uuid`, `name`, `created_at`, `chat_messages[]`
- **メッセージ**: `{ uuid, sender: "human"|"assistant", text, created_at, content, attachments }`
- **特徴**: `sender` フィールド ("human"/"assistant") が OpenAI の `role` と異なる

### 3. Open WebUI
- **形式**: JSON (個別チャット or 配列)、`chat` ラッパー付き
- **構造**: `{ id, title, models[], messages[], history: { current_id, messages: {} } }`
- **メッセージ**: `{ id, role, content, timestamp, parentId, models[] }`
- **特徴**: `history` オブジェクトでメッセージツリーを管理

### 4. LM Studio
- **形式**: JSON、OpenAI互換の `messages` 配列
- **構造**: `{ messages: [{ role, content }] }` + メタデータ
- **特徴**: 基本的に OpenAI Playground JSON と同じ構造

### 5. AnythingLLM
- **形式**: JSONL (1行1メッセージ交換) or JSON配列
- **構造**: OpenAI fine-tuning互換 `{ messages: [{ role, content }] }`
- **特徴**: ワークスペース単位のチャットログ

### 6. OpenRouter Chat
- **形式**: JSON、OpenAI互換の `messages` 配列
- **構造**: `{ messages: [{ role, content }], model: "..." }`
- **特徴**: モデル情報を含む OpenAI互換フォーマット

## 実装ステップ

### Step 1: 型定義の追加 (`src/types/export.ts`)
新しいインターフェースを追加:
- `ClaudeChat` - Claude.ai エクスポート形式
- `OpenWebUIChat` - Open WebUI 形式
- `OpenWebUIExport` - Open WebUI 一括エクスポート形式

LM Studio、AnythingLLM、OpenRouter は既存の `OpenAIPlaygroundJSON` と互換性があるため、追加の型は不要（検出ロジックで対応）。

### Step 2: フォーマット変換ユーティリティの追加 (`src/utils/import.ts`)
新しい変換関数を追加:
- `isClaudeChat()` / `isClaudeExport()` - Claude形式の検出
- `convertClaudeToConversationFormat()` - Claude → 内部形式変換
- `isOpenWebUIChat()` / `isOpenWebUIExport()` - Open WebUI形式の検出
- `convertOpenWebUIToConversationFormat()` - Open WebUI → 内部形式変換
- `isAnythingLLMJsonl()` - AnythingLLM JSONL形式の検出

### Step 3: インポートサービスの更新 (`src/components/ImportExportChat/importService.ts`)
- `ImportType` に `'ClaudeExport'`, `'OpenWebUIExport'` を追加
- `detectImportType()` に新しいフォーマット検出を追加
- `importParsedData()` に新しいケースを追加
- `readImportFile()` で `.jsonl` ファイルのサポートを追加（行ごとに解析して配列に変換）
- 各フォーマット用のインポート関数を追加

### Step 4: エクスポート変換ユーティリティの追加 (`src/utils/export.ts` 新規作成)
新しいエクスポート変換関数:
- `convertToClaudeFormat()` - 内部形式 → Claude形式
- `convertToOpenWebUIFormat()` - 内部形式 → Open WebUI形式
- `convertToChatGPTFormat()` - 内部形式 → ChatGPT `conversations.json` 形式
- `convertToOpenAIMessages()` - 内部形式 → OpenAI互換メッセージ配列 (LM Studio/OpenRouter/AnythingLLM共用)
- `convertToAnythingLLMJsonl()` - 内部形式 → JSONL形式

### Step 5: エクスポートUIの更新 (`src/components/ImportExportChat/ExportChat.tsx`)
- `ExportFormat` 型を拡張: `'v3' | 'v1' | 'chatgpt' | 'claude' | 'openwebui' | 'openai-messages' | 'jsonl'`
- 各フォーマットのラジオボタン/ドロップダウンを追加
- エクスポート時に選択されたフォーマットに応じた変換を実行

### Step 6: インポートUIの更新 (`src/components/ImportExportChat/ImportChat.tsx`)
- `accept` 属性に `.jsonl` を追加
- フォーマット自動検出の説明テキストを更新

### Step 7: 個別チャットダウンロードの更新 (`src/components/Chat/ChatContent/DownloadChat.tsx`)
- JSONボタンに加えて、各プラットフォーム形式でのダウンロードオプションを追加

### Step 8: i18n対応 (`public/locales/en/import.json`, `public/locales/ja/import.json`)
- 新しいフォーマット名のラベル
- エラーメッセージの追加
- `unrecognisedDataFormat` メッセージの更新（対応フォーマット一覧を更新）

### Step 9: テストの追加
- `src/utils/import.test.ts` - 各フォーマットの検出・変換テスト
- `src/utils/export.test.ts` - エクスポート変換テスト
- `importService.test.ts` - 新フォーマットのインテグレーションテスト

## ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/types/export.ts` | ClaudeChat, OpenWebUIChat 型定義追加 |
| `src/utils/import.ts` | 検出・変換関数追加 |
| `src/utils/export.ts` | **新規** エクスポート変換関数 |
| `src/components/ImportExportChat/importService.ts` | 新フォーマット対応 |
| `src/components/ImportExportChat/ExportChat.tsx` | エクスポートUI拡張 |
| `src/components/ImportExportChat/ImportChat.tsx` | accept属性更新 |
| `src/components/Chat/ChatContent/DownloadChat.tsx` | ダウンロードオプション追加 |
| `public/locales/en/import.json` | 英語メッセージ追加 |
| `public/locales/ja/import.json` | 日本語メッセージ追加 |
| `src/utils/import.test.ts` | インポートテスト追加 |
| `src/utils/export.test.ts` | **新規** エクスポートテスト |
| `src/components/ImportExportChat/importService.test.ts` | インテグレーションテスト追加 |

## 設計方針
- 既存の `detectImportType()` パターンを踏襲し、自動フォーマット検出を拡張
- 変換ロジックはユーティリティ関数として分離し、UIから独立
- エクスポートは共通の `convertToOpenAIMessages()` を基盤に、各フォーマット固有のラッパーを追加
- LM Studio / OpenRouter / AnythingLLM は OpenAI 互換のため、`openai-messages` として統一エクスポート
- JSONL はAnythingLLM 向けの追加エクスポートオプション
