# QuickText

ショートカットキーでCodex CLIやローカルAIを使って翻訳・文章変換を行うデスクトップアプリ

## 特徴

- **Codex CLI対応**: 既定でCodex CLIの `gpt-5.5` を利用
- **ローカルAI対応**: AI推論エンジン（llama-server）を内蔵
- **高速操作**: Cmd+C 2回で即座にAI処理
- **多機能**: 翻訳、丁寧語変換、言い換え、要約、校正など
- **日本語特化**: LFM 2.5 1.2B JP モデルを使用

## ダウンロード

| OS | ファイル |
|----|---------|
| macOS (Apple Silicon) | `QuickText-1.0.1-arm64.dmg` |
| Windows (64bit) | `QuickText Setup 1.0.0.exe`（旧バージョン） |

## インストール方法

### macOS
1. `QuickText-1.0.1-arm64.dmg` を開く
2. QuickTextをアプリケーションフォルダにドラッグ

### Windows
1. `QuickText Setup 1.0.0.exe` を実行
2. インストーラーの指示に従ってインストール

### 初回セットアップ

1. QuickTextを起動
2. 「AIモデルをダウンロード」をクリック（約730MB、初回のみ）
3. 「AI推論エンジンを起動」をクリック
4. 「QuickTextを開始」をクリック

## 使い方

### 基本操作

1. 任意のアプリでテキストを選択
2. `Cmd+C` を素早く2回押す
3. QuickTextが開き、選択テキストが自動で入力される
4. モードを選んで「生成」をクリック
5. 結果がクリップボードにコピーされる

### モード一覧

| モード | 説明 |
|--------|------|
| 翻訳 | 日本語→英語、英語→日本語を自動判定して翻訳 |
| 丁寧語 | カジュアルな表現をビジネス敬語に変換 |
| フランク | 敬語・丁寧な文をカジュアルに変換 |
| 要約 | テキストを3つの要点にまとめる |
| 校正 | 誤字脱字・読みやすさを改善 |


### メニューバー操作

システムトレイ（メニューバー）のアイコンから：
- 右クリック: モード選択メニュー
- 左クリック: ウィンドウの表示/非表示

## ショートカットキー

デフォルト: `Cmd+C` 2回（Mac）/ `Ctrl+C` 2回（Windows）

設定画面からホットキー方式に変更可能:
- `Cmd+Shift+V` / `Cmd+Shift+C` / `Cmd+Shift+T` (Mac)
- `Ctrl+Shift+V` / `Ctrl+Shift+C` / `Ctrl+Shift+T` (Windows)
- `F9` / `F10` / `F11` / `F12`

## AIモデル

| モデル | サイズ | 説明 |
|--------|--------|------|
| LFM 2.5 1.2B JP (Q4_K_M) | 731MB | 日本語特化、軽量高速 |

モデルは初回起動時にダウンロードされ、PC内に保存されます。

## AI実行方式

設定画面の「AI」タブから以下を選べます。

| 方式 | 用途 |
|------|------|
| ローカルAI | 内蔵 llama-server と LFM モデルで実行 |
| OpenAI互換API | OpenAI互換の `/v1/chat/completions` エンドポイントで実行 |
| Codex / Claude Code CLI | ローカルの `codex exec` または `claude --print` で実行 |

Codex / Claude Code CLI を使う場合は、事前に各CLIをインストールしてログインしてください。Codex CLI の既定モデルは `gpt-5.5` です。

## 動作環境

- macOS (Apple Silicon / M1以降)
- Windows 10/11 (64bit)
- ストレージ: 約1GB（アプリ + AIモデル）
- メモリ: 8GB以上推奨

## トラブルシューティング

### 「AI推論エンジンに接続できません」と表示される

1. 設定画面でAI推論エンジンの状態を確認
2. アプリを再起動してください
3. モデルがダウンロード済みか確認してください

### 生成が遅い

- 初回起動時はモデル読み込みに時間がかかります（数十秒）
- 2回目以降は高速に応答します

### Cmd+C 2回が反応しない

- 2回のCmd+Cの間隔を0.5秒以内にしてください
- 反応しない場合は、設定画面からホットキー方式（例: F11）に変更してください

## 技術仕様

- **フレームワーク**: Electron + React + TypeScript
- **AI推論**: llama-server（llama.cpp）内蔵
- **AIモデル**: LFM 2.5 1.2B JP (GGUF Q4_K_M)
- **ビルド**: Webpack 5 + electron-builder

## 開発者向け

```bash
# 依存パッケージのインストール
npm install

# 開発モードで起動
npm start

# ビルド
npm run build

# macOS用パッケージ作成
npm run dist:mac
```

## ライセンス

MIT License

## サードパーティライセンス

- **llama.cpp**: MIT License
- **LFM 2.5 1.2B JP**: LFM Open License v1.0

使用しているライブラリのライセンスは `THIRD_PARTY_LICENSES.txt` を参照してください。
