import React, { useState, useEffect } from 'react';

import { AIMode, Language, ClipboardEvent, ProviderType } from '../types';
import type { LocalAIStatus } from '../preload';
import MainView from './components/MainView';
import SettingsView from './components/SettingsView';
import SetupView from './components/SetupView';
import AccessibilityBanner from './components/AccessibilityBanner';
import './App.css';

type ViewType = 'main' | 'settings' | 'setup';
type TranslateDirection = 'auto' | 'ja2en' | 'en2ja';

const DIRECTION_LANGS: Record<TranslateDirection, { input: Language; output: Language }> = {
  auto: { input: Language.AUTO, output: Language.AUTO },
  ja2en: { input: Language.JAPANESE, output: Language.ENGLISH },
  en2ja: { input: Language.ENGLISH, output: Language.JAPANESE },
};

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType | null>(null);
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [mode, setMode] = useState<AIMode>(AIMode.TRANSLATE);
  const [translateDirection, setTranslateDirection] = useState<TranslateDirection>('auto');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [aiStatus, setAIStatus] = useState<LocalAIStatus | undefined>(undefined);
  const [needsAccessibility, setNeedsAccessibility] = useState(false);
  const isElectronRuntime = Boolean(window.electronAPI);
  const resolveLangs = (requestMode: AIMode) => {
    const directionLangs = DIRECTION_LANGS[translateDirection] || DIRECTION_LANGS.auto;
    return requestMode === AIMode.TRANSLATE ? directionLangs : DIRECTION_LANGS.auto;
  };

  // 初回セットアップのチェック
  useEffect(() => {
    if (!isElectronRuntime) {
      return undefined;
    }

    const checkSetup = async () => {
      try {
        const settings = await window.electronAPI.getSettings();
        if (settings.provider.type !== ProviderType.LOCAL) {
          setCurrentView('main');
          return;
        }

        // モデルがダウンロード済みか確認
        const modelResult = await window.electronAPI.checkModel();
        if (!modelResult.success || !modelResult.hasModel) {
          setCurrentView('setup');
          return;
        }

      setCurrentView('main');
      } catch (error) {
        // エラー時はセットアップ画面を表示
        setCurrentView('setup');
      }
    };

    checkSetup();
  }, [isElectronRuntime]);

  useEffect(() => {
    if (!isElectronRuntime) {
      return undefined;
    }

    window.electronAPI.getLocalAIStatus()
      .then(setAIStatus)
      .catch(() => undefined);

    return window.electronAPI.onLocalAIStatusChanged(setAIStatus);
  }, [isElectronRuntime]);

  useEffect(() => {
    if (!isElectronRuntime) {
      return undefined;
    }

    const checkAccessibility = async () => {
      try {
        const settings = await window.electronAPI.getSettings();
        if (settings.shortcut.triggerType === 'double_copy') {
          const granted = await window.electronAPI.checkAccessibility();
          setNeedsAccessibility(!granted);
        }
      } catch {}
    };

    checkAccessibility();
    return window.electronAPI.onAccessibilityStatus(({ granted }) => {
      setNeedsAccessibility(!granted);
    });
  }, [isElectronRuntime]);

  // ホットキートリガーをリッスン
  useEffect(() => {
    if (!isElectronRuntime) {
      return undefined;
    }

    const handleCCTriggered = async (event: ClipboardEvent) => {
      setInputText(event.text);
      setError('');
      setOutputText('');
      setSuccessMessage('');

      if (aiStatus?.providerType === ProviderType.LOCAL && !aiStatus.ready) {
        setError('モデル準備中');
        return;
      }
      
      // 自動生成を実行
      if (event.text && event.text.trim().length > 0) {
        // モードが指定されている場合は設定
        if (event.mode) {
          setMode(event.mode);
        }
        
        // 少し待ってから自動生成
        setTimeout(async () => {
          setIsLoading(true);
          setError('');
          setOutputText('');
          setSuccessMessage('');

          try {
          const requestMode = event.mode || mode;
          const requestLangs = resolveLangs(requestMode);
          const response = await window.electronAPI.generateAIStream(
            {
              inputText: event.text,
              mode: requestMode,
              inputLanguage: requestLangs.input,
              outputLanguage: requestLangs.output,
            },
            (token: string) => setOutputText((prev) => prev + token)
          );

            if ('error' in response) {
              setError(response.error);
            } else {
              setOutputText(response.outputText);

              // 自動コピー設定を確認
              const settings = await window.electronAPI.getSettings();
              if (settings.output.autoClipboard) {
                await window.electronAPI.writeClipboard(response.outputText);
                setSuccessMessage('📋 クリップボードにコピーしました');
                setTimeout(() => setSuccessMessage(''), 3000);
              }
            }
          } catch (err: any) {
            const errorMessage = err.message || 'エラーが発生しました';
            setError(errorMessage);
          } finally {
            setIsLoading(false);
          }
        }, 300);
      }
    };

    const cleanup = window.electronAPI.onCCTriggered(handleCCTriggered);
    window.electronAPI.notifyRendererReady();
    return cleanup;
  }, [aiStatus, isElectronRuntime, mode, translateDirection]);

  /**
   * AI生成を実行
   */
  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (aiStatus?.providerType === ProviderType.LOCAL && !aiStatus.ready) {
      setError('モデル準備中');
      return;
    }
    if (!inputText.trim()) {
      setError('入力テキストが空です');
      return;
    }

    setIsLoading(true);
    setError('');
    setOutputText('');
    setSuccessMessage('');

    try {
      const requestLangs = resolveLangs(mode);
      const response = await window.electronAPI.generateAIStream(
        {
          inputText,
          mode,
          inputLanguage: requestLangs.input,
          outputLanguage: requestLangs.output,
        },
        (token: string) => setOutputText((prev) => prev + token)
      );

      if ('error' in response) {
        setError(response.error);
      } else {
        setOutputText(response.outputText);
        // 自動コピー設定を確認
        const settings = await window.electronAPI.getSettings();
        if (settings.output.autoClipboard) {
          await window.electronAPI.writeClipboard(response.outputText);
          setSuccessMessage('📋 クリップボードにコピーしました');
        } else {
          setSuccessMessage('生成完了');
        }
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (err: any) {
      const errorMessage = err.message || 'エラーが発生しました';
      setError(errorMessage);
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
   * 入力変更
   */
  const handleInputChange = (text: string) => {
    setInputText(text);
    if (successMessage) {
      setSuccessMessage('');
    }
    if (error) {
      setError('');
    }
  };

  /**
   * 出力変更
   */
  const handleOutputChange = (text: string) => {
    setOutputText(text);
    if (successMessage) {
      setSuccessMessage('');
    }
    if (error) {
      setError('');
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

  const handleSetupComplete = () => {
    setCurrentView('main');
  };

  const handleGrantAccessibility = async () => {
    try {
      await window.electronAPI.requestAccessibility();
      const granted = await window.electronAPI.reapplyTriggers();
      setNeedsAccessibility(!granted);
    } catch {}
  };

  if (!isElectronRuntime) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
        <div>
          <h1 style={{ margin: '0 0 12px' }}>QuickText</h1>
          <p style={{ margin: 0, color: '#888' }}>
            このHTMLはElectronアプリ用です。プロジェクトルートで npm start を実行してください。
          </p>
        </div>
      </div>
    );
  }

  // 初期化中は何も表示しない
  if (currentView === null) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888' }}>読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {currentView === 'setup' ? (
        <SetupView onComplete={handleSetupComplete} />
      ) : currentView === 'main' ? (
        <div className="main-with-accessibility">
          {needsAccessibility && <AccessibilityBanner onGrant={handleGrantAccessibility} />}
          <MainView
            inputText={inputText}
            outputText={outputText}
            mode={mode}
            translateDirection={translateDirection}
            isLoading={isLoading}
            error={error}
            successMessage={successMessage}
            status={aiStatus}
            onInputChange={handleInputChange}
            onOutputChange={handleOutputChange}
            onModeChange={setMode}
            onTranslateDirectionChange={setTranslateDirection}
            onGenerate={handleGenerate}
            onCopyOutput={handleCopyOutput}
            onOpenSettings={handleOpenSettings}
          />
        </div>
      ) : (
        <SettingsView onClose={handleCloseSettings} />
      )}
    </div>
  );
}
