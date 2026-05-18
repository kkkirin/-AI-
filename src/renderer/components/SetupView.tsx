import React, { useState, useEffect } from 'react';
import '../styles/SetupView.css';

interface SetupViewProps {
  onComplete: () => void;
}

interface RecommendedModel {
  name: string;
  description: string;
  size: string;
}

export default function SetupView({ onComplete }: SetupViewProps) {
  const [hasModel, setHasModel] = useState(false);
  const [checking, setChecking] = useState(true);
  const [recommendedModels, setRecommendedModels] = useState<RecommendedModel[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [downloadedMB, setDownloadedMB] = useState(0);
  const [totalMB, setTotalMB] = useState(0);
  const [error, setError] = useState('');
  const [serverStarting, setServerStarting] = useState(false);
  const [serverReady, setServerReady] = useState(false);

  useEffect(() => {
    checkModel();
    loadRecommendedModels();

    // ダウンロード進捗を受信
    window.electronAPI.onDownloadProgress((data) => {
      const match = data.message.match(/(\d+)%/);
      if (match) {
        setDownloadPercent(parseInt(match[1], 10));
      }
      if (data.downloaded && data.total) {
        setDownloadedMB(Math.round(data.downloaded / (1024 * 1024)));
        setTotalMB(Math.round(data.total / (1024 * 1024)));
      }
    });
  }, []);

  const checkModel = async () => {
    setChecking(true);
    setError('');
    try {
      const result = await window.electronAPI.checkModel();
      setHasModel(result.hasModel);
    } catch (err: any) {
      setError(`確認エラー: ${err.message || '不明なエラー'}`);
    } finally {
      setChecking(false);
    }
  };

  const loadRecommendedModels = async () => {
    const models = await window.electronAPI.getRecommendedModels();
    setRecommendedModels(models);
  };

  const handleDownload = async () => {
    if (recommendedModels.length === 0) return;

    setDownloading(true);
    setError('');
    setDownloadPercent(0);
    setDownloadedMB(0);
    setTotalMB(0);

    try {
      const modelId = recommendedModels[0].name;
      const result = await window.electronAPI.downloadModel(modelId);
      if (!result.success) {
        setError(result.error || 'ダウンロードに失敗しました');
      } else {
        setHasModel(true);
      }
    } catch (err: any) {
      setError(err.message || 'エラーが発生しました');
    } finally {
      setDownloading(false);
    }
  };

  const handleStartServer = async () => {
    setServerStarting(true);
    setError('');
    try {
      const result = await window.electronAPI.startServer();
      if (result.success) {
        // AIプロバイダーを初期化
        await window.electronAPI.reinitializeAI();
        setServerReady(true);
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError(`起動エラー: ${err.message || '不明なエラー'}`);
    } finally {
      setServerStarting(false);
    }
  };

  const handleComplete = async () => {
    await window.electronAPI.setSetupCompleted();
    onComplete();
  };

  const defaultModel = recommendedModels[0];

  return (
    <div className="setup-view">
      <div className="setup-header">
        <h1>QuickText セットアップ</h1>
        <p>ローカルAIを使用して翻訳・文章変換を行います</p>
      </div>

      <div className="setup-content">
        {/* ステップ1: モデルダウンロード */}
        <div className="setup-step">
          <h2>1. AIモデルのダウンロード</h2>

          {hasModel ? (
            <div className="status connected">
              ✓ AIモデルがダウンロード済みです
            </div>
          ) : (
            <>
              {defaultModel && (
                <div className="model-info-card">
                  <div className="model-card-content">
                    <div className="model-card-header">
                      <span className="model-name">{defaultModel.name}</span>
                      <span className="model-size">{defaultModel.size}</span>
                    </div>
                    <div className="model-description">{defaultModel.description}</div>
                  </div>
                </div>
              )}

              {downloading && (
                <div className="download-progress">
                  <div className="progress-header">
                    <span>ダウンロード中...</span>
                    <span>{downloadedMB > 0 ? `${downloadedMB}MB / ${totalMB}MB` : ''}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${downloadPercent}%` }} />
                  </div>
                  <div className="progress-percent">{downloadPercent}%</div>
                </div>
              )}

              {error && <div className="error-message">{error}</div>}

              {!downloading && (
                <button
                  className="btn btn-primary btn-large"
                  onClick={handleDownload}
                  disabled={checking}
                >
                  AIモデルをダウンロード
                </button>
              )}

              <p className="hint" style={{ marginTop: '10px', fontSize: '12px', color: '#888' }}>
                初回のみダウンロードが必要です（約730MB）。データはPC内に保存されます。
              </p>
            </>
          )}
        </div>

        {/* ステップ2: 動作確認 */}
        {hasModel && (
          <div className="setup-step">
            <h2>2. AI推論エンジンの起動</h2>

            {serverReady ? (
              <div className="status connected">
                ✓ AI推論エンジンが起動しました
              </div>
            ) : (
              <>
                {error && <div className="error-message">{error}</div>}

                <button
                  className="btn btn-primary"
                  onClick={handleStartServer}
                  disabled={serverStarting}
                  style={{ opacity: serverStarting ? 0.6 : 1 }}
                >
                  {serverStarting ? '起動中...' : 'AI推論エンジンを起動'}
                </button>

                <p className="hint" style={{ marginTop: '10px', fontSize: '12px', color: '#888' }}>
                  初回のモデル読み込みには数十秒かかる場合があります。
                </p>
              </>
            )}
          </div>
        )}

        {/* 完了ボタン */}
        {hasModel && serverReady && (
          <div className="setup-step">
            <h2>3. セットアップ完了</h2>
            <p>準備が整いました。QuickTextを使い始めましょう！</p>
            <button className="btn btn-primary btn-large" onClick={handleComplete}>
              QuickTextを開始
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
