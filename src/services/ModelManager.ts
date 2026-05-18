import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';

export interface ModelInfo {
  id: string;
  filename: string;
  url: string;
  sizeLabel: string;
  sizeBytes: number;
  description: string;
}

/**
 * 既定のモデル一覧
 */
export const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: 'LFM2.5-1.2B-JP-Q4_K_M',
    filename: 'LFM2.5-1.2B-JP-Q4_K_M.gguf',
    url: 'https://huggingface.co/LiquidAI/LFM2.5-1.2B-JP-GGUF/resolve/main/LFM2.5-1.2B-JP-Q4_K_M.gguf',
    sizeLabel: '731MB',
    sizeBytes: 766279680, // approx 731MB
    description: 'LFM 2.5 1.2B JP (Q4_K_M) - 日本語特化、軽量高速',
  },
];

export type DownloadProgressCallback = (downloaded: number, total: number) => void;

/**
 * GGUF モデルのダウンロード・管理
 */
export class ModelManager {
  private modelsDir: string;
  private abortController: AbortController | null = null;

  constructor() {
    this.modelsDir = path.join(app.getPath('userData'), 'models');
    this.ensureModelsDir();
  }

  private ensureModelsDir(): void {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  /**
   * モデル保存ディレクトリのパスを取得
   */
  getModelsDir(): string {
    return this.modelsDir;
  }

  /**
   * 指定モデルのファイルパスを取得
   */
  getModelPath(modelId: string): string {
    const info = DEFAULT_MODELS.find((m) => m.id === modelId);
    if (!info) {
      throw new Error(`不明なモデルID: ${modelId}`);
    }
    return path.join(this.modelsDir, info.filename);
  }

  /**
   * モデルがダウンロード済みかチェック
   */
  isModelDownloaded(modelId: string): boolean {
    try {
      const modelPath = this.getModelPath(modelId);
      return fs.existsSync(modelPath);
    } catch {
      return false;
    }
  }

  /**
   * ダウンロード済みモデルの一覧を取得
   */
  getAvailableModels(): string[] {
    return DEFAULT_MODELS
      .filter((m) => this.isModelDownloaded(m.id))
      .map((m) => m.id);
  }

  /**
   * 推奨モデル情報を取得
   */
  getRecommendedModels(): ModelInfo[] {
    return DEFAULT_MODELS;
  }

  /**
   * モデルをHugging Faceからダウンロード
   */
  async downloadModel(
    modelId: string,
    onProgress?: DownloadProgressCallback
  ): Promise<void> {
    const info = DEFAULT_MODELS.find((m) => m.id === modelId);
    if (!info) {
      throw new Error(`不明なモデルID: ${modelId}`);
    }

    const destPath = path.join(this.modelsDir, info.filename);
    const tempPath = destPath + '.download';

    // 途中までダウンロード済みの場合はレジューム
    let startByte = 0;
    if (fs.existsSync(tempPath)) {
      const stat = fs.statSync(tempPath);
      startByte = stat.size;
    }

    this.abortController = new AbortController();

    try {
      const headers: Record<string, string> = {};
      if (startByte > 0) {
        headers['Range'] = `bytes=${startByte}-`;
      }

      const response = await axios.get(info.url, {
        responseType: 'stream',
        headers,
        signal: this.abortController.signal,
        timeout: 30000,
      });

      const totalLength = startByte + parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = startByte;

      const writer = fs.createWriteStream(tempPath, {
        flags: startByte > 0 ? 'a' : 'w',
      });

      const stream = response.data as NodeJS.ReadableStream;

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (onProgress) {
            onProgress(downloaded, totalLength);
          }
        });

        stream.pipe(writer);

        writer.on('finish', () => resolve());
        writer.on('error', (err) => reject(err));
        stream.on('error', (err) => reject(err));
      });

      // ダウンロード完了: temp → 正式ファイルにリネーム
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      fs.renameSync(tempPath, destPath);

      console.log('モデルダウンロード完了:', info.filename);
    } catch (error: any) {
      if (axios.isCancel(error)) {
        console.log('モデルダウンロードがキャンセルされました');
        throw new Error('ダウンロードがキャンセルされました');
      }
      throw new Error(`モデルのダウンロードに失敗しました: ${error.message}`);
    } finally {
      this.abortController = null;
    }
  }

  /**
   * ダウンロードをキャンセル
   */
  cancelDownload(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * モデルファイルを削除
   */
  deleteModel(modelId: string): void {
    const modelPath = this.getModelPath(modelId);
    if (fs.existsSync(modelPath)) {
      fs.unlinkSync(modelPath);
    }
    // temp ファイルも削除
    const tempPath = modelPath + '.download';
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

// シングルトン
let instance: ModelManager | null = null;

export function getModelManager(): ModelManager {
  if (!instance) {
    instance = new ModelManager();
  }
  return instance;
}
