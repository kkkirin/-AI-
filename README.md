# cc-AI: コピー（cc）でAIに送信する翻訳・文章変換アプリ

## 概要

**cc-AI** は、コピー操作を2回（cc）することでテキストをAIに送信し、翻訳・文章変換を行うElectronベースのデスクトップアプリケーションです。

### 主な特徴

- ⚡ **高速操作**: ccトリガーで即座にAIに送信
- 🌐 **多機能**: 翻訳、ていねい化、言い換え、要約、校正など
- 🔒 **セキュア**: APIキーはOSキーチェーン/DPAPIで安全に保存
- 🎯 **プライバシー重視**: 除外アプリ、パターンマッチング、履歴管理
- 🔄 **拡張性**: Phase 2でローカルAIに切り替え可能な設計

## 技術スタック

- **フレームワーク**: Electron + React + TypeScript
- **ビルドツール**: Webpack 5
- **AI連携**: OpenAI互換API（gpt-4-mini推奨）
- **セキュリティ**: keytar（OSキーチェーン統合）
- **クリップボード監視**: clipboard-monitor

## プロジェクト構成

```
cc-ai/
├── src/
│   ├── main.ts                 # Electronメインプロセス
│   ├── preload.ts              # プリロードスクリプト
│   ├── types/
│   │   └── index.ts            # 型定義
│   ├── services/
│   │   ├── AIProvider.ts       # AIプロバイダー抽象クラス
│   │   ├── OpenAIProvider.ts   # OpenAI実装
│   │   ├── ClipboardMonitor.ts # クリップボード監視
│   │   └── SettingsManager.ts  # 設定管理
│   └── renderer/
│       ├── App.tsx             # メインコンポーネント
│       ├── index.tsx           # エントリーポイント
│       ├── components/
│       │   ├── MainView.tsx    # メイン画面
│       │   └── SettingsView.tsx # 設定画面
│       └── styles/
│           ├── App.css
│           ├── MainView.css
│           └── SettingsView.css
├── public/
│   └── index.html              # HTMLテンプレート
├── webpack.config.js           # Webpack設定
├── tsconfig.json               # TypeScript設定
└── package.json                # 依存パッケージ
```

## インストール

### 前提条件

- Node.js 18+
- npm または yarn
- OpenAI APIキー

### セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/kkkirin/-AI-.git
cd -AI-

# 依存パッケージをインストール
npm install

# ビルド
npm run build

# アプリを起動
npm start
```

## 使用方法

### 基本的な流れ

1. **アプリを起動**: `npm start`
2. **APIキーを設定**: 設定画面でOpenAI APIキーを入力
3. **テキストを選択**: 任意のアプリでテキストを選択
4. **ccトリガー**: Ctrl+C（またはCmd+C）を0.5秒以内に2回押す
5. **結果を確認**: フローティング画面に結果が表示される
6. **クリップボードにコピー**: 自動または手動でコピー

### モード選択

- **翻訳**: 日本語 ↔ 英語の自動翻訳
- **ていねい化**: カジュアルな表現をビジネス丁寧に変換
- **言い換え**: 異なる表現で同じ意味を表現
- **要約**: テキストを3行の箇条書きに要約
- **校正**: 誤字脱字・読みやすさを改善
- **コード/技術文**: 技術用語を保持して処理

## 設定

### 一般設定

- 自動起動
- テーマ（ライト/ダーク）
- フォントサイズ

### AI設定

- APIプロバイダ（OpenAI / Azure OpenAI）
- APIエンドポイント
- モデル選択
- トークン上限設定

### 出力設定

- 自動クリップボード保存
- 自動貼り付け（危険度高）
- 改行保持

### プライバシー設定

- 履歴の有効/無効
- 履歴の暗号化
- 除外パターン（正規表現）
- 除外アプリ

## 開発

### 開発モードで起動

```bash
npm run dev
```

Webpackがファイル変更を監視し、自動的に再ビルドします。

### ビルド

```bash
npm run build
```

### TypeScript コンパイル

```bash
npx tsc
```

## API設計

### AIプロバイダーインターフェース

```typescript
abstract class AIProvider {
  abstract generate(request: AIRequest): Promise<AIResponse>;
  abstract estimate(inputText: string): Promise<{ language: Language; suggestedMode: AIMode }>;
  abstract healthCheck(): Promise<boolean>;
}
```

このインターフェースにより、Phase 2でローカルAIプロバイダーに簡単に切り替え可能です。

## エラーハンドリング

| エラー | 対応 |
|--------|------|
| 401/403 | APIキーが無効 → 設定を確認 |
| 429 | レート制限 → 時間を置いて再試行 |
| 5xx | プロバイダ障害 → 再試行 |
| タイムアウト | ネットワーク問題 → 再試行 |

## セキュリティ

- ✅ APIキーはOSキーチェーン/DPAPIで暗号化保存
- ✅ 送信前に除外パターンをチェック
- ✅ 履歴は暗号化して保存（オプション）
- ✅ 送信内容をUIで確認可能

## 仕様書

詳細な仕様書は以下を参照してください：
- [仕様書 Phase 1](./docs/specification.md)

## ロードマップ

### Phase 1 ✅ 完了
- API経由のAI処理
- ccトリガー検出
- 基本的なモード実装
- 設定画面

### Phase 2 🔄 計画中
- ローカルAI（オンデバイス）への切り替え
- 履歴管理の充実
- 用語集機能
- 除外アプリ設定の自動化

### Phase 3 🔄 計画中
- DB参照による仕様書ドラフト自動生成
- チーム共有機能
- 共同編集機能

## トラブルシューティング

### libsecret-1.so.0 エラー

Linux環境で以下を実行してください：

```bash
sudo apt-get install libsecret-1-0
```

### X Server エラー

GUI環境が必要です。WSL2やリモート環境では、X11フォワーディングを設定してください。

## ライセンス

MIT

## 作成者

kkkirin

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。
