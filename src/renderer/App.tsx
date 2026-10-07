import React, { useState, useEffect, useRef } from 'react';

import { AIMode, Language, ClipboardEvent, ProviderType, WorkspaceLayout } from '../types';
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
  const [layout, setLayout] = useState<WorkspaceLayout>('auto');
  // 実行中の生成のrequestId。キャンセル・新しい生成で入れ替わり、古い結果/トークンを捨てる判定に使う
  const activeRequestIdRef = useRef<string | null>(null);
  const ccTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationStartedAtRef = useRef(0);
  const isElectronRuntime = Boolean(window.electronAPI);
  const resolveLangs = (requestMode: AIMode) => {
    const directionLangs = DIRECTION_LANGS[translateDirection] || DIRECTION_LANGS.auto;
    return requestMode === AIMode.TRANSLATE ? directionLangs : DIRECTION_LANGS.auto;
  };

  useEffect(() => {
    if (!isElectronRuntime) {
      return undefined;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeRequestIdRef.current) {
        e.preventDefault();
        cancelGeneration();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'a') {
        const el = document.activeElement;
        const isTextInput = el instanceof HTMLInputElement
          || el instanceof HTMLTextAreaElement
          || (el as HTMLElement)?.isContentEditable;

        if (!isTextInput) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isElectronRuntime]);

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
    if (!isElectronRuntime || currentView !== 'main') {
      return;
    }
    window.electronAPI.getSettings()
      .then((settings) => setLayout(settings.ui.layout || 'auto'))
      .catch(() => undefined);
  }, [isElectronRuntime, currentView]);

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

  const showSuccessMessage = (message: string, durationMs: number) => {
    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current);
    }
    setSuccessMessage(message);
    messageTimerRef.current = setTimeout(() => setSuccessMessage(''), durationMs);
  };

  /**
   * 生成を実行（ボタン・ホットキー共通）。実行中の生成があれば中断して差し替える
   */
  const clearPendingCCTimer = () => {
    if (ccTimerRef.current) {
      clearTimeout(ccTimerRef.current);
      ccTimerRef.current = null;
    }
  };

  const runGeneration = async (text: string, requestMode: AIMode) => {
    clearPendingCCTimer();
    if (activeRequestIdRef.current) {
      window.electronAPI.cancelAIStream(activeRequestIdRef.current);
    }
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeRequestIdRef.current = requestId;
    generationStartedAtRef.current = Date.now();
    const isCurrent = () => activeRequestIdRef.current === requestId;

    setIsLoading(true);
    setError('');
    setOutputText('');
    setSuccessMessage('');

    try {
      const requestLangs = resolveLangs(requestMode);
      const response = await window.electronAPI.generateAIStream(
        {
          inputText: text,
          mode: requestMode,
          inputLanguage: requestLangs.input,
          outputLanguage: requestLangs.output,
        },
        (token: string) => {
          if (isCurrent()) {
            setOutputText((prev) => prev + token);
          }
        },
        requestId
      );

      if (!isCurrent()) {
        return;
      }
      if ('error' in response) {
        if (response.cancelled) {
          showSuccessMessage('キャンセルしました', 2000);
        } else {
          setError(response.error);
        }
        return;
      }

      setOutputText(response.outputText);
      const settings = await window.electronAPI.getSettings();
      if (!isCurrent()) {
        return;
      }
      if (settings.output.autoClipboard && response.outputText) {
        await window.electronAPI.writeClipboard(response.outputText);
        if (!isCurrent()) {
          return;
        }
        showSuccessMessage('📋 クリップボードにコピーしました', 3000);
      } else {
        showSuccessMessage('生成完了', 3000);
      }
    } catch (err: any) {
      if (isCurrent()) {
        setError(err?.message || 'エラーが発生しました');
      }
    } finally {
      if (isCurrent()) {
        activeRequestIdRef.current = null;
        setIsLoading(false);
      }
    }
  };

  /**
   * 生成をキャンセル（途中まで出た出力は残す）
   */
  const cancelGeneration = () => {
    clearPendingCCTimer();
    const requestId = activeRequestIdRef.current;
    if (!requestId) {
      return;
    }
    activeRequestIdRef.current = null;
    window.electronAPI.cancelAIStream(requestId);
    setIsLoading(false);
    setError('');
    showSuccessMessage('キャンセルしました', 2000);
  };

  // 「生成」と同じ位置にキャンセルが出るため、ダブルクリックの2回目で即キャンセルしないよう直後のクリックは無視する
  const handleCancelClick = () => {
    if (Date.now() - generationStartedAtRef.current < 400) {
      return;
    }
    cancelGeneration();
  };

  // ホットキートリガーをリッスン
  useEffect(() => {
    if (!isElectronRuntime) {
      return undefined;
    }

    const handleCCTriggered = (event: ClipboardEvent) => {
      // 連続トリガー時は待機中の自動生成を取り消し、実行中の生成も止める
      clearPendingCCTimer();
      if (activeRequestIdRef.current) {
        window.electronAPI.cancelAIStream(activeRequestIdRef.current);
        activeRequestIdRef.current = null;
        setIsLoading(false);
      }

      setInputText(event.text);
      setError('');
      setOutputText('');
      setSuccessMessage('');

      if (aiStatus?.providerType === ProviderType.LOCAL && !aiStatus.ready) {
        setError('モデル準備中');
        return;
      }

      if (event.text && event.text.trim().length > 0) {
        if (event.mode) {
          setMode(event.mode);
        }
        const requestMode = event.mode || mode;
        // 少し待ってから自動生成
        ccTimerRef.current = setTimeout(() => {
          ccTimerRef.current = null;
          void runGeneration(event.text, requestMode);
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

    await runGeneration(inputText, mode);
  };

  /**
   * 出力をコピー
   */
  const handleCopyOutput = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (outputText) {
      await window.electronAPI.writeClipboard(outputText);
      showSuccessMessage('クリップボードにコピーしました', 2000);
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
            layout={layout}
            onGenerate={handleGenerate}
            onCancel={handleCancelClick}
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
