import React, { useState, useEffect } from 'react';
import { AppSettings, ProviderType } from '../../types';
import '../styles/SettingsView.css';

interface SettingsViewProps {
  onClose: () => void;
}

interface LocalModel {
  name: string;
  displayName?: string;
  description: string;
  size: string;
}

interface ShortcutPreset {
  key: string;
  label: string;
}

export default function SettingsView({ onClose }: SettingsViewProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeTab, setActiveTab] = useState('general');
  const [message, setMessage] = useState('');
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [recommendedModels, setRecommendedModels] = useState<LocalModel[]>([]);
  const [serverConnected, setServerConnected] = useState(false);
  const [currentShortcut, setCurrentShortcut] = useState('');
  const [shortcutPresets, setShortcutPresets] = useState<ShortcutPreset[]>([]);
  const [shortcutInput, setShortcutInput] = useState('');
  const [isShortcutRecording, setIsShortcutRecording] = useState(false);

  // 設定を読み込む
  useEffect(() => {
    loadSettings();
    loadLocalAIInfo();
    loadShortcutInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!settings) {
      return;
    }

    if (settings.provider.type === ProviderType.LOCAL && localModels.length > 0) {
      if (!localModels.includes(settings.provider.model)) {
        setSettings({
          ...settings,
          provider: { ...settings.provider, model: localModels[0] },
        });
      }
      return;
    }
  }, [settings, localModels]);

  const loadShortcutInfo = async () => {
    try {
      const shortcut = await window.electronAPI.getCurrentShortcut();
      setCurrentShortcut(shortcut);
      setShortcutInput(shortcut);
      const presets = await window.electronAPI.getShortcutPresets();
      setShortcutPresets(presets);
    } catch (error) {
      console.error('Error loading shortcut info:', error);
    }
  };

  const getModelLabel = (model: string) => {
    const recommended = recommendedModels.find((item) => item.name === model);
    if (!recommended) {
      return model;
    }
    return `${recommended.displayName || model} · ${recommended.size}`;
  };

  const isMac = () => window.navigator.platform.toLowerCase().includes('mac');

  const normalizeKey = (key: string) => {
    if (key.length === 1) {
      return key.toUpperCase();
    }
    if (key.startsWith('Arrow')) {
      return key.replace('Arrow', '');
    }
    if (key === ' ') {
      return 'Space';
    }
    return key;
  };

  const buildShortcut = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const keys: string[] = [];
    if (isMac()) {
      if (event.metaKey) keys.push('Command');
      if (event.ctrlKey) keys.push('Control');
      if (event.altKey) keys.push('Alt');
      if (event.shiftKey) keys.push('Shift');
    } else {
      if (event.ctrlKey) keys.push('Ctrl');
      if (event.altKey) keys.push('Alt');
      if (event.shiftKey) keys.push('Shift');
    }

    const normalizedKey = normalizeKey(event.key);
    const isModifierOnly =
      normalizedKey === 'Meta' ||
      normalizedKey === 'Control' ||
      normalizedKey === 'Alt' ||
      normalizedKey === 'Shift';
    if (isModifierOnly) {
      return '';
    }
    return [...keys, normalizedKey].join('+');
  };

  const handleChangeShortcut = async (shortcut: string) => {
    try {
      const result = await window.electronAPI.setShortcut(shortcut);
      if (result.success) {
        setCurrentShortcut(shortcut);
        setShortcutInput(shortcut);
        if (settings) {
          setSettings({
            ...settings,
            shortcut: { ...settings.shortcut, alternateHotkey: shortcut },
          });
        }
        setMessage(`ショートカットを ${shortcut} に変更しました`);
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage(`エラー: ${result.error}`);
      }
    } catch (error) {
      setMessage('ショートカットの変更に失敗しました');
    }
  };

  const loadLocalAIInfo = async () => {
    try {
      // llama-server接続確認
      const connectionResult = await window.electronAPI.checkLocalAIConnection();
      setServerConnected(connectionResult.connected);

      // 利用可能なモデル取得
      const modelsResult = await window.electronAPI.getLocalModels();
      if (modelsResult.success) {
        setLocalModels(modelsResult.models);
      }

      // 推奨モデル取得
      const recommended = await window.electronAPI.getRecommendedModels();
      setRecommendedModels(recommended);
    } catch (error) {
      console.error('Error loading local AI info:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const loadedSettings = await window.electronAPI.getSettings();
      setSettings(loadedSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleStartServer = async () => {
    try {
      const result = await window.electronAPI.startServer();
      if (result.success) {
        await window.electronAPI.reinitializeAI();
        await loadLocalAIInfo();
        setMessage(result.message);
      } else {
        setMessage(`エラー: ${result.message}`);
      }
    } catch {
      setMessage('AI推論エンジンの起動に失敗しました');
    }
  };

  const handleSaveSettings = async () => {
    if (settings) {
      try {
        const result = await window.electronAPI.saveSettings(settings);
        if (result.success) {
          await loadLocalAIInfo();
          setMessage('設定を保存しました');
          setTimeout(() => setMessage(''), 3000);
        } else {
          setMessage(`エラー: ${result.error}`);
        }
      } catch (error) {
        setMessage('設定の保存に失敗しました');
      }
    }
  };


  if (!settings) {
    return <div className="settings-view">読み込み中...</div>;
  }

  const isMacPlatform = isMac();
  const isDoubleCopy = settings.shortcut.triggerType === 'double_copy';
  const doubleCopyLabel = isMacPlatform ? '⌘+C ×2' : 'Ctrl+C ×2';
  const defaultHotkey = isMacPlatform ? 'Command+Shift+V' : 'Ctrl+Shift+V';

  return (
    <div className="settings-view">
      <div className="settings-header">
        <h2>設定</h2>
        <button className="close-btn" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* タブナビゲーション */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          一般
        </button>
        <button
          className={`tab ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          AI
        </button>
        <button
          className={`tab ${activeTab === 'output' ? 'active' : ''}`}
          onClick={() => setActiveTab('output')}
        >
          出力
        </button>
      </div>

      {/* タブコンテンツ */}
      <div className="tab-content">
        {/* 一般設定 */}
        {activeTab === 'general' && (
          <div className="settings-group">
            <h3>一般設定</h3>
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={settings.ui.autoStart}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      ui: { ...settings.ui, autoStart: e.target.checked },
                    })
                  }
                />
                起動時に自動開始
              </label>
            </div>

            <h3 style={{ marginTop: '24px' }}>終了時の動作</h3>
            <div className="setting-item">
              <label>{isMacPlatform ? '⌘+Q で終了時:' : 'ウィンドウを閉じる時:'}</label>
              <select
                value={settings.ui.closeAction || 'minimize_to_tray'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    ui: { ...settings.ui, closeAction: e.target.value as AppSettings['ui']['closeAction'] },
                  })
                }
              >
                <option value="minimize_to_tray">トレイに常駐（バックグラウンド動作）</option>
                <option value="confirm">終了前に確認する</option>
                <option value="quit">そのまま終了する</option>
              </select>
              <div className="setting-note">
                ※ トレイの「終了」ボタンからはいつでも完全終了できます。
              </div>
            </div>

            <h3 style={{ marginTop: '24px' }}>ショートカット設定</h3>
            <div className="setting-item">
              <label>起動方法:</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label>
                  <input
                    type="radio"
                    name="triggerType"
                    checked={settings.shortcut.triggerType === 'double_copy'}
                    onChange={() =>
                      setSettings({
                        ...settings,
                        shortcut: { ...settings.shortcut, triggerType: 'double_copy' },
                      })
                    }
                  />
                  {isMacPlatform ? '⌘+C' : 'Ctrl+C'} を2回 (DeepL風)
                </label>
                <label>
                  <input
                    type="radio"
                    name="triggerType"
                    checked={settings.shortcut.triggerType === 'hotkey'}
                    onChange={() =>
                      setSettings({
                        ...settings,
                        shortcut: {
                          ...settings.shortcut,
                          triggerType: 'hotkey',
                          alternateHotkey: settings.shortcut.alternateHotkey || defaultHotkey,
                        },
                      })
                    }
                  />
                  ホットキーで起動（推奨）
                </label>
              </div>
              <div className="setting-note">
                ※ {doubleCopyLabel} は通常のコピー操作と競合しやすいため、必要な場合だけ使ってください。
              </div>
            </div>
            <div className="setting-item">
              <label>AIトリガーキー:</label>
              <input
                type="text"
                value={shortcutInput}
                disabled={isDoubleCopy}
                readOnly
                placeholder={isShortcutRecording ? 'キーを入力...' : 'クリックして入力'}
                onFocus={() => setIsShortcutRecording(true)}
                onBlur={() => setIsShortcutRecording(false)}
                onKeyDown={(e) => {
                  e.preventDefault();
                  if (e.key === 'Escape') {
                    setIsShortcutRecording(false);
                    setShortcutInput(currentShortcut);
                    return;
                  }
                  const shortcut = buildShortcut(e);
                  if (!shortcut) {
                    return;
                  }
                  setIsShortcutRecording(false);
                  void handleChangeShortcut(shortcut);
                }}
              />
              <div className="setting-note">
                ※ 入力欄をクリックしてから希望のキーを押してください。
              </div>
            </div>
            <div className="setting-item">
              <label>プリセット:</label>
              <select
                value={currentShortcut}
                disabled={isDoubleCopy}
                onChange={(e) => handleChangeShortcut((e.target as HTMLSelectElement).value)}
              >
                {shortcutPresets.map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="setting-item">
              <label>現在のショートカット:</label>
              <div className="shortcut-current">
                {isDoubleCopy ? doubleCopyLabel : currentShortcut || 'F12'}
              </div>
            </div>
          </div>
        )}

        {/* AI設定 */}
        {activeTab === 'ai' && (
          <div className="settings-group">
            <h3>AI設定</h3>

            <div className="setting-item">
              <label>AI推論エンジン状態:</label>
              <div className={`engine-status ${serverConnected ? 'on' : 'off'}`}>
                <span className="dot" />
                <span>{serverConnected ? '起動中' : '停止中'}</span>
                {!serverConnected && (
                  <button className="btn-small" onClick={handleStartServer}>
                    起動
                  </button>
                )}
              </div>
            </div>
            <div className="setting-item">
              <label>ダウンロード済みモデル:</label>
              <div className="model-list">
                {localModels.length > 0 ? (
                  localModels.map((model) => (
                    <div key={model} className="model-row">
                      • {getModelLabel(model)}
                    </div>
                  ))
                ) : (
                  <div className="model-row">モデルがダウンロードされていません</div>
                )}
              </div>
            </div>
            <div className="setting-item">
              <label>ローカルAIの特性:</label>
              <div className="setting-note">
                <div>• 通信はローカルのみ（外部APIに送信しない）</div>
                <div>• 初回はモデル読み込みで時間がかかることがある</div>
                <div>• 速度と品質はモデルサイズ・PC性能に依存</div>
              </div>
            </div>
          </div>
        )}

        {/* 出力設定 */}
        {activeTab === 'output' && (
          <div className="settings-group">
            <h3>出力設定</h3>
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={settings.output.autoClipboard}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      output: { ...settings.output, autoClipboard: e.target.checked },
                    })
                  }
                />
                自動でクリップボードに保存
              </label>
            </div>
          </div>
        )}

      </div>

      {/* メッセージ表示 */}
      {message && <div className="message">{message}</div>}

      {/* ボタン */}
      <div className="settings-footer">
        <button className="btn btn-primary" onClick={handleSaveSettings}>
          保存
        </button>
        <button className="btn btn-secondary" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
