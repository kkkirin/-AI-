import React, { useState, useEffect } from 'react';

import { AIMode, Language, ClipboardEvent } from '../types';
import MainView from './components/MainView';
import SettingsView from './components/SettingsView';
import { ToastContainer, Notification } from './components/Toast';
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
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // ccトリガーをリッスン
  useEffect(() => {
    window.electronAPI.onCCTriggered((event: ClipboardEvent) => {
      setInputText(event.text);
      setError('');
      setOutputText('');
      // cc検出の通知
      addNotification('info', 'cc検出', 'クリップボードから取得しました', 2000);
    });

    // クリップボード監視を開始
    window.electronAPI.startClipboardMonitor(500);

    return () => {
      window.electronAPI.stopClipboardMonitor();
    };
  }, []);

  /**
   * 通知を追加
   */
  const addNotification = (
    type: 'info' | 'success' | 'warning' | 'error',
    title: string,
    message: string,
    duration: number = 3000
  ) => {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const notification: Notification = {
      id,
      type,
      title,
      message,
      duration,
      timestamp: Date.now(),
    };
    setNotifications((prev) => [...prev, notification]);
    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }
  };

  /**
   * 通知を削除
   */
  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  /**
   * AI生成を実行
   */
  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) {
      setError('入力テキストが空です');
      addNotification('error', 'エラー', '入力テキストが空です');
      return;
    }

    setIsLoading(true);
    setError('');
    setOutputText('');
    addNotification('info', '処理中', 'AIに送信中...');

    try {
      const response = await window.electronAPI.generateAI({
        inputText,
        mode,
        inputLanguage: Language.AUTO,
        outputLanguage: Language.AUTO,
      });

      if ('error' in response) {
        setError(response.error);
        addNotification('error', 'エラー', response.error);
      } else {
        setOutputText(response.outputText);
        setSuccessMessage('生成完了');
        addNotification('success', '完了', '処理が完了しました');
        setTimeout(() => setSuccessMessage(''), 3000);

        // 自動コピー設定を確認
        const settings = await window.electronAPI.getSettings();
        if (settings.output.autoClipboard) {
          await window.electronAPI.writeClipboard(response.outputText);
          addNotification('success', 'コピー完了', 'クリップボードにコピーしました');
        }
      }
    } catch (err: any) {
      const errorMessage = err.message || 'エラーが発生しました';
      setError(errorMessage);
      addNotification('error', 'エラー', errorMessage);
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
      addNotification('success', 'コピー完了', 'クリップボードにコピーしました');
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
      <ToastContainer notifications={notifications} onClose={removeNotification} />
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
