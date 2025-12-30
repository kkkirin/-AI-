import React, { useState, useEffect } from 'react';
import { AIMode, Language, ClipboardEvent } from '../types';
import MainView from './components/MainView';
import SettingsView from './components/SettingsView';
import './App.css';

type ViewType = 'main' | 'settings';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('main');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [mode, setMode] = useState<AIMode>(AIMode.TRANSLATE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // ccトリガーをリッスン
  useEffect(() => {
    window.electronAPI.onCCTriggered((event: ClipboardEvent) => {
      setInputText(event.text);
      setError('');
      setOutputText('');
    });

    // クリップボード監視を開始
    window.electronAPI.startClipboardMonitor(500);

    return () => {
      window.electronAPI.stopClipboardMonitor();
    };
  }, []);

  /**
   * AI生成を実行
   */
  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) {
      setError('入力テキストが空です');
      return;
    }

    setIsLoading(true);
    setError('');
    setOutputText('');

    try {
      const response = await window.electronAPI.generateAI({
        inputText,
        mode,
        inputLanguage: Language.AUTO,
        outputLanguage: Language.AUTO,
      });

      if ('error' in response) {
        setError(response.error);
      } else {
        setOutputText(response.outputText);
        setSuccessMessage('生成完了');
        setTimeout(() => setSuccessMessage(''), 3000);

        // 自動コピー設定を確認
        const settings = await window.electronAPI.getSettings();
        if (settings.output.autoClipboard) {
          await window.electronAPI.writeClipboard(response.outputText);
        }
      }
    } catch (err: any) {
      setError(err.message || 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 出力をコピー
   */
  const handleCopyOutput = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (outputText) {
      await window.electronAPI.writeClipboard(outputText);
      setSuccessMessage('クリップボードにコピーしました');
      setTimeout(() => setSuccessMessage(''), 2000);
    }
  };

  /**
   * 設定を開く
   */
  const handleOpenSettings = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setCurrentView('settings');
  };

  /**
   * 設定を閉じる
   */
  const handleCloseSettings = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setCurrentView('main');
  };

  return (
    <div className="app">
      {currentView === 'main' ? (
        <MainView
          inputText={inputText}
          outputText={outputText}
          mode={mode}
          isLoading={isLoading}
          error={error}
          successMessage={successMessage}
          onInputChange={setInputText}
          onModeChange={setMode}
          onGenerate={handleGenerate}
          onCopyOutput={handleCopyOutput}
          onOpenSettings={handleOpenSettings}
        />
      ) : (
        <SettingsView onClose={handleCloseSettings} />
      )}
    </div>
  );
}
