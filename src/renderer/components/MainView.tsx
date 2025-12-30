import React from 'react';
import { AIMode } from '../../types';
import '../styles/MainView.css';

interface MainViewProps {
  inputText: string;
  outputText: string;
  mode: AIMode;
  isLoading: boolean;
  error: string;
  successMessage: string;
  onInputChange: (text: string) => void;
  onModeChange: (mode: AIMode) => void;
  onGenerate: () => void;
  onCopyOutput: () => void;
  onOpenSettings: () => void;
}

export default function MainView({
  inputText,
  outputText,
  mode,
  isLoading,
  error,
  successMessage,
  onInputChange,
  onModeChange,
  onGenerate,
  onCopyOutput,
  onOpenSettings,
}: MainViewProps) {
  const modeLabels: Record<AIMode, string> = {
    [AIMode.TRANSLATE]: '翻訳',
    [AIMode.POLITE]: 'ていねい化',
    [AIMode.REPHRASE]: '言い換え',
    [AIMode.SUMMARIZE]: '要約',
    [AIMode.PROOFREADING]: '校正',
    [AIMode.CODE_TECHNICAL]: 'コード/技術文',
  };

  return (
    <div className="main-view">
      {/* ヘッダー */}
      <div className="header">
        <h1>cc-AI</h1>
        <button className="settings-btn" onClick={onOpenSettings} title="設定">
          ⚙️
        </button>
      </div>

      {/* モード選択 */}
      <div className="mode-selector">
        <label htmlFor="mode">モード:</label>
        <select
          id="mode"
          value={mode}
          onChange={(e) => onModeChange((e.target as HTMLSelectElement).value as AIMode)}
          disabled={isLoading}
        >
          {Object.entries(modeLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* 入力エリア */}
      <div className="input-section">
        <label htmlFor="input">入力:</label>
        <textarea
          id="input"
          value={inputText}
          onChange={(e) => onInputChange((e.target as HTMLTextAreaElement).value)}
          placeholder="テキストを入力またはコピー（cc）してください"
          disabled={isLoading}
          className="text-area"
        />
      </div>

      {/* 出力エリア */}
      <div className="output-section">
        <label htmlFor="output">出力:</label>
        <textarea
          id="output"
          value={outputText}
          readOnly
          placeholder="結果がここに表示されます"
          className="text-area output"
        />
      </div>

      {/* エラー表示 */}
      {error && <div className="error-message">{error}</div>}

      {/* 成功メッセージ */}
      {successMessage && <div className="success-message">{successMessage}</div>}

      {/* ボタングループ */}
      <div className="button-group">
        <button
          className="btn btn-primary"
          onClick={onGenerate}
          disabled={isLoading || !inputText.trim()}
        >
          {isLoading ? '処理中...' : '生成'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={onCopyOutput}
          disabled={!outputText}
        >
          コピー
        </button>
      </div>

      {/* フッター */}
      <div className="footer">
        <small>API経由で処理中 • プライバシー設定を確認してください</small>
      </div>
    </div>
  );
}
