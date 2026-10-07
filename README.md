# QuickText

ショートカットとローカルAIで、翻訳・ていねい化・要約・校正をするデスクトップアプリ（自分用）。
テキストは外に送らず、内蔵の llama-server で処理する。

## 使い方

1. 文章を選んでショートカット（既定: `Cmd/Ctrl+Shift+V`、設定で `Cmd/Ctrl+C` ×2 も可）
2. 自動で変換が始まる。止めたいときは「キャンセル」か `Esc`
3. 結果は自動でクリップボードに入る

設定 → 一般 →「画面レイアウト」で、入力と出力の並びを「自動 / 左右に固定 / 上下に固定」から選べる。

モデルは初回にダウンロード（LFM 2.5 1.2B JP: 731MB 軽い／Gemma 3 4B: 2.5GB 高品質）。

## インストール

| | コマンド | できるもの |
|---|---|---|
| Mac | `npm run dist:mac` | `release/QuickText-<版>-arm64.dmg` |
| Windows | `npm run dist:win`（Macからも作れる） | `release/QuickText Setup <版>.exe` |

`resources/llama/`（llama-server 本体）は git に入っていない。ビルドするマシンに `mac-arm64/` `win-x64/` を置いておく。

## 開発

```bash
npm install
npm start      # 起動
npm test       # テスト
```

Electron + React + TypeScript / webpack / electron-builder。

## ライセンス

使用ライブラリ・モデルのライセンスは `THIRD_PARTY_LICENSES.txt` と `resources/licenses/`。
