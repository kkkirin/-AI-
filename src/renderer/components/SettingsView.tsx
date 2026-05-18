import React, { useState, useEffect } from 'react';
import { AppSettings, CLIProviderType, ProviderType } from '../../types';
import '../styles/SettingsView.css';

interface SettingsViewProps {
  onClose: () => void;
}

interface LocalModel {
  name: string;
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
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);

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
    return `${model} (${recommended.size}) - ${recommended.description}`;
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
      const keyResult = await window.electronAPI.hasAPIKey();
      setApiKeyConfigured(Boolean(keyResult.success && keyResult.hasAPIKey));
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleProviderTypeChange = (type: ProviderType) => {
    if (!settings) return;

    const nextProvider = { ...settings.provider, type };
    const shouldUseCodexDefaultModel =
      !nextProvider.model ||
      nextProvider.model.startsWith('LFM2.5-') ||
      nextProvider.model === 'gpt-4o-mini';

    if (type === ProviderType.API && (!nextProvider.model || nextProvider.model.startsWith('LFM2.5-'))) {
      nextProvider.model = 'gpt-4o-mini';
    }
    if (type === ProviderType.CLI) {
      nextProvider.cliProvider = nextProvider.cliProvider || 'codex';
      if (shouldUseCodexDefaultModel) {
        nextProvider.model = nextProvider.cliProvider === 'codex' ? 'gpt-5.5' : '';
      }
    }
    if (type === ProviderType.LOCAL) {
      nextProvider.model = localModels[0] || 'LFM2.5-1.2B-JP-Q4_K_M';
    }

    setSettings({
      ...settings,
      provider: nextProvider,
    });
  };

  const handleSetAPIKey = async () => {
    const trimmedKey = apiKeyInput.trim();
    if (!trimmedKey) {
      setMessage('APIキーを入力してください');
      return;
    }

    try {
      const result = await window.electronAPI.setAPIKey(trimmedKey);
      if (result.success) {
        setApiKeyInput('');
        setApiKeyConfigured(true);
        setMessage('APIキーを保存しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage(`エラー: ${result.error}`);
      }
    } catch {
      setMessage('APIキーの保存に失敗しました');
    }
  };

  const handleDeleteAPIKey = async () => {
    try {
      const result = await window.electronAPI.deleteAPIKey();
      if (result.success) {
        setApiKeyInput('');
        setApiKeyConfigured(false);
        setMessage('APIキーを削除しました');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage(`エラー: ${result.error}`);
      }
    } catch {
      setMessage('APIキーの削除に失敗しました');
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
              <div style={{ fontSize: '12px', color: '#a0a0a0', marginTop: '4px' }}>
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
              <div style={{ fontSize: '12px', color: '#a0a0a0', marginTop: '6px' }}>
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
              <div style={{ fontSize: '12px', color: '#a0a0a0', marginTop: '4px' }}>
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
              <div style={{ 
                padding: '8px 12px', 
                backgroundColor: '#3d3d3d', 
                borderRadius: '4px', 
                display: 'inline-block',
                fontFamily: 'monospace',
                color: '#4ade80'
              }}>
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
              <label>AI実行方式:</label>
              <select
                value={settings.provider.type}
                onChange={(e) => handleProviderTypeChange((e.target as HTMLSelectElement).value as ProviderType)}
              >
                <option value={ProviderType.LOCAL}>ローカルAI</option>
                <option value={ProviderType.API}>OpenAI互換API</option>
                <option value={ProviderType.CLI}>Codex / Claude Code CLI</option>
              </select>
            </div>

            {settings.provider.type === ProviderType.LOCAL && (
              <>
                <div className="setting-item">
                  <label>
                    AI推論エンジン状態:
                    {serverConnected ? (
                      <span style={{ color: '#4ade80', marginLeft: '8px' }}>✓ 起動中</span>
                    ) : (
                      <span style={{ color: '#f87171', marginLeft: '8px' }}>✗ 停止中</span>
                    )}
                  </label>
                </div>
                <div className="setting-item">
                  <label>ダウンロード済みモデル:</label>
                  <div style={{ fontSize: '12px', color: '#a0a0a0', marginTop: '4px' }}>
                    {localModels.length > 0 ? (
                      localModels.map((m) => (
                        <div key={m} style={{ padding: '2px 0' }}>
                          • {getModelLabel(m)}
                        </div>
                      ))
                    ) : (
                      <div>モデルがダウンロードされていません</div>
                    )}
                  </div>
                </div>
                <div className="setting-item">
                  <label>ローカルAIの特性:</label>
                  <div style={{ fontSize: '12px', color: '#a0a0a0', marginTop: '4px', lineHeight: 1.6 }}>
                    <div>• 通信はローカルのみ（外部APIに送信しない）</div>
                    <div>• 初回はモデル読み込みで時間がかかることがある</div>
                    <div>• 速度と品質はモデルサイズ・PC性能に依存</div>
                  </div>
                </div>
              </>
            )}

            {settings.provider.type === ProviderType.API && (
              <>
                <div className="setting-item">
                  <label>APIエンドポイント:</label>
                  <input
                    type="text"
                    value={settings.provider.apiEndpoint || ''}
                    placeholder="https://api.openai.com/v1"
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        provider: { ...settings.provider, apiEndpoint: e.target.value },
                      })
                    }
                  />
                  <div style={{ fontSize: '12px', color: '#a0a0a0', marginTop: '4px' }}>
                    OpenAI互換の /v1/chat/completions に送信します。空欄ならOpenAI公式APIを使います。
                  </div>
                </div>
                <div className="setting-item">
                  <label>モデル:</label>
                  <input
                    type="text"
                    value={settings.provider.model}
                    placeholder="gpt-4o-mini"
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        provider: { ...settings.provider, model: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="setting-item">
                  <label>APIキー:</label>
                  <div className="api-key-controls">
                    <input
                      type="password"
                      value={apiKeyInput}
                      placeholder={apiKeyConfigured ? '設定済み（変更する場合のみ入力）' : 'APIキーを入力'}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                    />
                    <button className="btn-small" onClick={handleSetAPIKey}>
                      保存
                    </button>
                    {apiKeyConfigured && (
                      <button className="btn-small" onClick={handleDeleteAPIKey}>
                        削除
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {settings.provider.type === ProviderType.CLI && (
              <>
                <div className="setting-item">
                  <label>CLI:</label>
                  <select
                    value={settings.provider.cliProvider || 'codex'}
                    onChange={(e) => {
                      const cliProvider = (e.target as HTMLSelectElement).value as CLIProviderType;
                      const shouldUseCodexDefault =
                        cliProvider === 'codex' &&
                        (!settings.provider.model ||
                          settings.provider.model.startsWith('LFM2.5-') ||
                          settings.provider.model === 'gpt-4o-mini');
                      setSettings({
                        ...settings,
                        provider: {
                          ...settings.provider,
                          cliProvider,
                          model: shouldUseCodexDefault ? 'gpt-5.5' : settings.provider.model,
                        },
                      });
                    }}
                  >
                    <option value="codex">Codex CLI</option>
                    <option value="claude">Claude Code</option>
                  </select>
                </div>
                <div className="setting-item">
                  <label>モデル（任意）:</label>
                  <input
                    type="text"
                    value={settings.provider.model}
                    placeholder={settings.provider.cliProvider === 'claude' ? '空欄ならClaude Codeの既定モデル' : 'gpt-5.5'}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        provider: { ...settings.provider, model: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="setting-item">
                  <label>CLIコマンド（任意）:</label>
                  <input
                    type="text"
                    value={settings.provider.cliCommand || ''}
                    placeholder={settings.provider.cliProvider === 'claude' ? 'claude' : 'codex'}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        provider: { ...settings.provider, cliCommand: e.target.value || undefined },
                      })
                    }
                  />
                  <div style={{ fontSize: '12px', color: '#a0a0a0', marginTop: '4px', lineHeight: 1.6 }}>
                    <div>• Codexは `codex exec`、Claude Codeは `claude --print` を非対話で実行します。</div>
                    <div>• 事前に各CLIでログイン済みである必要があります。</div>
                  </div>
                </div>
              </>
            )}

            <div className="setting-item">
              <label>最大トークン数（リクエスト）:</label>
              <input
                type="number"
                value={settings.provider.maxTokensPerRequest}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    provider: {
                      ...settings.provider,
                      maxTokensPerRequest: parseInt(e.target.value),
                    },
                  })
                }
              />
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
            <div className="setting-item">
              <label>改行を保持:</label>
              <input
                type="checkbox"
                checked={settings.output.preserveLineBreaks}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    output: { ...settings.output, preserveLineBreaks: e.target.checked },
                  })
                }
              />
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
