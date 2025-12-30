import React, { useState, useEffect } from 'react';
import { AppSettings } from '../../types';
import '../styles/SettingsView.css';

interface SettingsViewProps {
  onClose: () => void;
}

export default function SettingsView({ onClose }: SettingsViewProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [activeTab, setActiveTab] = useState('general');
  const [message, setMessage] = useState('');

  // 設定を読み込む
  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSettings = async () => {
    try {
      const loadedSettings = await window.electronAPI.getSettings();
      setSettings(loadedSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleSaveSettings = async () => {
    if (settings) {
      try {
        const result = await window.electronAPI.saveSettings(settings);
        if (result.success) {
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

  const handleSetAPIKey = async () => {
    if (apiKeyInput.trim()) {
      try {
        const result = await window.electronAPI.setAPIKey(apiKeyInput);
        if (result.success) {
          setApiKey(apiKeyInput);
          setApiKeyInput('');
          setMessage('APIキーを設定しました');
          setTimeout(() => setMessage(''), 3000);
        } else {
          setMessage(`エラー: ${result.error}`);
        }
      } catch (error) {
        setMessage('APIキーの設定に失敗しました');
      }
    }
  };

  const handleDeleteAPIKey = async () => {
    try {
      const result = await window.electronAPI.deleteAPIKey();
      if (result.success) {
        setApiKey('');
        setMessage('APIキーを削除しました');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      setMessage('APIキーの削除に失敗しました');
    }
  };

  if (!settings) {
    return <div className="settings-view">読み込み中...</div>;
  }

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
        <button
          className={`tab ${activeTab === 'privacy' ? 'active' : ''}`}
          onClick={() => setActiveTab('privacy')}
        >
          プライバシー
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
            <div className="setting-item">
              <label>テーマ:</label>
              <select
                value={settings.ui.theme}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    ui: { ...settings.ui, theme: (e.target as HTMLSelectElement).value as 'light' | 'dark' },
                  })
                }
              >
                <option value="light">ライト</option>
                <option value="dark">ダーク</option>
              </select>
            </div>
            <div className="setting-item">
              <label>フォントサイズ:</label>
              <input
                type="number"
                min="10"
                max="20"
                value={settings.ui.fontSize}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    ui: { ...settings.ui, fontSize: parseInt(e.target.value) },
                  })
                }
              />
            </div>
          </div>
        )}

        {/* AI設定 */}
        {activeTab === 'ai' && (
          <div className="settings-group">
            <h3>AI設定</h3>
            <div className="setting-item">
              <label>APIプロバイダ:</label>
              <select
                value={settings.provider.apiProvider}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    provider: { ...settings.provider, apiProvider: (e.target as HTMLSelectElement).value as any },
                  })
                }
              >
                <option value="openai">OpenAI</option>
                <option value="azure">Azure OpenAI</option>
              </select>
            </div>
            <div className="setting-item">
              <label>APIエンドポイント:</label>
              <input
                type="text"
                value={settings.provider.apiEndpoint || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    provider: { ...settings.provider, apiEndpoint: e.target.value },
                  })
                }
              />
            </div>
            <div className="setting-item">
              <label>モデル:</label>
              <input
                type="text"
                value={settings.provider.model}
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
                {apiKey ? (
                  <div className="api-key-status">
                    <span>✓ 設定済み</span>
                    <button className="btn-small" onClick={handleDeleteAPIKey}>
                      削除
                    </button>
                  </div>
                ) : (
                  <div className="api-key-input">
                    <input
                      type="password"
                      placeholder="APIキーを入力"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                    />
                    <button className="btn-small" onClick={handleSetAPIKey}>
                      設定
                    </button>
                  </div>
                )}
              </div>
            </div>
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
            <div className="setting-item">
              <label>1日あたりのトークン上限:</label>
              <input
                type="number"
                value={settings.provider.dailyTokenLimit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    provider: {
                      ...settings.provider,
                      dailyTokenLimit: parseInt(e.target.value),
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
              <label>
                <input
                  type="checkbox"
                  checked={settings.output.autoPaste}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      output: { ...settings.output, autoPaste: e.target.checked },
                    })
                  }
                />
                自動貼り付け（危険）
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

        {/* プライバシー設定 */}
        {activeTab === 'privacy' && (
          <div className="settings-group">
            <h3>プライバシー設定</h3>
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={settings.privacy.enableHistory}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      privacy: { ...settings.privacy, enableHistory: e.target.checked },
                    })
                  }
                />
                履歴を保存
              </label>
            </div>
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={settings.privacy.encryptHistory}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      privacy: { ...settings.privacy, encryptHistory: e.target.checked },
                    })
                  }
                  disabled={!settings.privacy.enableHistory}
                />
                履歴を暗号化
              </label>
            </div>
            <div className="setting-item">
              <label>除外パターン（1行ずつ）:</label>
              <textarea
                value={settings.privacy.excludePatterns.join('\n')}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    privacy: {
                      ...settings.privacy,
                      excludePatterns: e.target.value.split('\n').filter((p) => p.trim()),
                    },
                  })
                }
                placeholder="password=&#10;api_key&#10;-----BEGIN"
                rows={5}
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
