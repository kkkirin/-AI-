import React, { useEffect, useState } from 'react';
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
  const [isInputPreviewOpen, setIsInputPreviewOpen] = useState(false);

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

  useEffect(() => {
    if (hasOutput) {
      setIsInputPreviewOpen(false);
    }
  }, [hasOutput, outputText]);

  return (
    <div className="main-view">
      {/* ヘッダー */}
      <div className="header">
        <h1>QuickText</h1>
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
        {!isResultView && (
          <div className="input-section primary-input">
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
        )}

        {isResultView && (
          <div className={`input-preview ${isInputPreviewOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="preview-toggle"
              onClick={() => setIsInputPreviewOpen((current) => !current)}
              aria-expanded={isInputPreviewOpen}
              aria-controls="input-preview-body"
            >
              <span>入力</span>
              <span className="preview-toggle-meta">
                {inputText.length}文字 · {isInputPreviewOpen ? '閉じる' : '表示'}
              </span>
            </button>
            {isInputPreviewOpen && (
              <div id="input-preview-body" className="input-preview-body">
                {inputText}
              </div>
            )}
          </div>
        )}

        <div className={`output-section ${isResultView ? 'primary-output' : 'waiting-output'}`}>
          <div className="section-header">
            <label id="output-label">出力</label>
            {isResultView && <span className="section-meta">{outputText.length}文字</span>}
          </div>
          {isLoading ? (
            <div className="output-state" role="status" aria-live="polite">
              処理中...
            </div>
          ) : hasOutput ? (
            <div
              className="output-reader"
              role="textbox"
              aria-labelledby="output-label"
              aria-readonly="true"
              tabIndex={0}
            >
              {outputText}
            </div>
          ) : (
            <div className="output-state muted">生成すると結果がここに表示されます</div>
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
              disabled={!hasInput}
            >
              再生成
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
            disabled={isLoading || !hasInput}
          >
            {isLoading ? '処理中...' : '生成'}
          </button>
        )}
      </div>

    </div>
  );
}
