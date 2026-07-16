import React from 'react';
import { AIMode } from '../../types';
import type { LocalAIStatus } from '../../preload';
import '../styles/MainView.css';

interface MainViewProps {
  inputText: string;
  outputText: string;
  mode: AIMode;
  isLoading: boolean;
  error: string;
  successMessage: string;
  status?: LocalAIStatus;
  onInputChange: (text: string) => void;
  onOutputChange: (text: string) => void;
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
  status,
  onInputChange,
  onOutputChange,
  onModeChange,
  onGenerate,
  onCopyOutput,
  onOpenSettings,
}: MainViewProps) {
  const modeLabels: Record<AIMode, string> = {
    [AIMode.TRANSLATE]: '翻訳',
    [AIMode.POLITE]: 'ていねい化',
    [AIMode.REPHRASE]: 'フランク',
    [AIMode.SUMMARIZE]: '要約',
    [AIMode.PROOFREADING]: '校正',
  };

  const modeDescriptions: Record<AIMode, string> = {
    [AIMode.TRANSLATE]: '日本語 ↔ 英語を自動判定して翻訳',
    [AIMode.POLITE]: 'カジュアルな表現をビジネス敬語に変換',
    [AIMode.REPHRASE]: '敬語・丁寧な文をカジュアルに変換',
    [AIMode.SUMMARIZE]: 'テキストを3つの要点に要約',
    [AIMode.PROOFREADING]: '誤字脱字・文法・読みやすさを修正',
  };

  const hasInput = inputText.trim().length > 0;
  const hasOutput = outputText.trim().length > 0;
  const isResultView = hasOutput && !isLoading;
  const isLocalNotReady = status?.providerType === 'local' && status.ready === false;
  const providerLabel = status?.providerType === 'local'
    ? 'ローカル'
    : status?.providerType === 'api'
      ? 'API'
      : 'CLI';
  const statusClass = status?.ready
    ? 'ready'
    : status?.providerType === 'local' && status.running
      ? 'loading'
      : 'offline';
  const statusText = status?.ready
    ? `${status.modelName}・${providerLabel}`
    : status?.providerType === 'local' && status.running
      ? 'モデル読み込み中…'
      : '未接続';

  return (
    <div className="main-view">
      {/* ヘッダー */}
      <div className="header">
        <div className="header-title-group">
          <h1>QuickText</h1>
          {status && (
            <span className={`ai-status-pill ${statusClass}`}>
              <span className="ai-status-dot" aria-hidden="true" />
              {statusText}
            </span>
          )}
        </div>
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
        <div className="mode-description">{modeDescriptions[mode]}</div>
      </div>

      <div className={`workspace ${isResultView ? 'has-result' : 'is-editing'}`}>
        <div className={`input-section ${isResultView ? 'result-input' : 'primary-input'}`}>
          <div className="section-header">
            <label htmlFor="input">入力</label>
            <span className="section-meta">{hasInput ? `${inputText.length}文字` : '未入力'}</span>
          </div>
          <textarea
            id="input"
            value={inputText}
            onChange={(e) => onInputChange((e.target as HTMLTextAreaElement).value)}
            placeholder="テキストを入力またはコピー（cc）してください"
            disabled={isLoading}
            className="text-area"
          />
        </div>

        <div className={`output-section ${isResultView ? 'primary-output' : 'waiting-output'}`}>
          <div className="section-header">
            <label htmlFor="output">出力</label>
            <span className="section-meta">{hasOutput ? `${outputText.length}文字` : '未入力'}</span>
          </div>
          {isLoading && !outputText ? (
            <div className="output-state" role="status" aria-live="polite">
              処理中...
            </div>
          ) : (
            <textarea
              id="output"
              value={outputText}
              onChange={(e) => onOutputChange((e.target as HTMLTextAreaElement).value)}
              placeholder="生成すると結果がここに表示されます"
              className="text-area output"
            />
          )}
        </div>
      </div>

      {/* エラー表示 */}
      {error && <div className="error-message">{error}</div>}

      {/* 成功メッセージ */}
      {successMessage && <div className="success-message">{successMessage}</div>}

      {/* ボタングループ */}
      <div className="button-group">
        {isResultView ? (
          <>
            <button
            className="btn btn-secondary"
            onClick={onGenerate}
            disabled={!hasInput || isLocalNotReady}
          >
            {isLocalNotReady ? '準備中…' : '再生成'}
            </button>
            <button
              className="btn btn-primary"
              onClick={onCopyOutput}
              disabled={!hasOutput}
            >
              コピー
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary"
            onClick={onGenerate}
            disabled={isLoading || !hasInput || isLocalNotReady}
          >
            {isLocalNotReady ? '準備中…' : isLoading ? '処理中...' : '生成'}
          </button>
        )}
      </div>

    </div>
  );
}
