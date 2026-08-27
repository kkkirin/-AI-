import { app } from 'electron';
import { ChildProcess, spawn, exec } from 'child_process';
import * as path from 'path';
import * as net from 'net';
import * as os from 'os';
import axios from 'axios';

/**
 * llama-server プロセスのライフサイクル管理
 */
export class LlamaServerManager {
  private process: ChildProcess | null = null;
  private port: number = 0;
  private modelPath: string = '';
  private onUnexpectedExit: (() => void) | null = null;

  /**
   * サーバーが stop() 経由でなく突然死んだときに呼ばれるコールバックを登録
   */
  setOnUnexpectedExit(callback: () => void): void {
    this.onUnexpectedExit = callback;
  }

  /**
   * プラットフォームに応じたバイナリディレクトリ名を取得
   */
  private getPlatformDir(): string {
    if (process.platform === 'win32') {
      return 'win-x64';
    }
    return 'mac-arm64';
  }

  /**
   * llama-server バイナリのパスを取得
   */
  private getBinaryDir(): string {
    const platformDir = this.getPlatformDir();
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'llama', platformDir);
    }
    // 開発モード: app.getAppPath() はプロジェクトルートを返す
    return path.join(app.getAppPath(), 'resources', 'llama', platformDir);
  }

  private getBinaryPath(): string {
    const binaryName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
    return path.join(this.getBinaryDir(), binaryName);
  }

  /**
   * 空きポートを取得
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });
    });
  }

  private async findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          const port = addr.port;
          server.close(() => resolve(port));
        } else {
          server.close(() => reject(new Error('ポートの取得に失敗しました')));
        }
      });
      server.on('error', reject);
    });
  }

  private async resolvePort(preferredPort?: number): Promise<number> {
    if (preferredPort && await this.isPortAvailable(preferredPort)) {
      return preferredPort;
    }

    if (preferredPort) {
      console.warn(`指定ポート ${preferredPort} は使用中です。空きポートにフォールバックします。`);
    }
    return this.findFreePort();
  }

  /**
   * llama-server を起動
   */
  async start(modelPath: string, preferredPort?: number): Promise<void> {
    if (this.process) {
      console.log('llama-server は既に起動しています');
      return;
    }

    this.modelPath = modelPath;
    this.port = await this.resolvePort(preferredPort);

    const binaryPath = this.getBinaryPath();
    const binaryDir = this.getBinaryDir();
    console.log('llama-server 起動:', binaryPath, 'ポート:', this.port);

    // プラットフォーム別の起動引数
    const args = [
      '-m', modelPath,
      '-c', '4096',
      '--host', '127.0.0.1',
      '--port', String(this.port),
    ];

    const threads = Math.max(1, os.cpus().length - 2);
    args.push('-fa', 'on', '-t', String(threads));

    // GPU オフロード設定: macOS は Metal、Windows は Vulkan
    if (process.platform === 'darwin') {
      args.push('-ngl', '99');
    } else if (process.platform === 'win32') {
      // Vulkan GPU を使用（Vulkanビルド同梱）
      args.push('-ngl', '99');
    }

    // プラットフォーム別の環境変数
    const env: Record<string, string | undefined> = { ...process.env };
    if (process.platform === 'darwin') {
      env.DYLD_LIBRARY_PATH = binaryDir;
    } else if (process.platform === 'win32') {
      // Windows: DLLの検索パスにバイナリディレクトリを追加
      env.PATH = binaryDir + ';' + (process.env.PATH || '');
    }

    this.process = spawn(binaryPath, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: binaryDir,
    });
    // モデル切替等で旧プロセスの exit が新プロセスのハンドルを消さないよう、
    // ハンドラは自分のプロセスにだけ作用させる（stop() 済みなら何もしない）
    const proc = this.process;

    proc.stdout?.on('data', (data: Buffer) => {
      console.log('[llama-server]', data.toString().trim());
    });

    proc.stderr?.on('data', (data: Buffer) => {
      console.log('[llama-server:err]', data.toString().trim());
    });

    proc.on('exit', (code, signal) => {
      console.log(`llama-server 終了: code=${code}, signal=${signal}`);
      if (this.process === proc) {
        this.process = null;
        this.onUnexpectedExit?.();
      }
    });

    proc.on('error', (err) => {
      console.error('llama-server 起動エラー:', err.message);
      if (this.process === proc) {
        this.process = null;
        this.onUnexpectedExit?.();
      }
    });

    // ヘルスチェックで起動完了を待つ（最大60秒）
    await this.waitForReady(60000);
  }

  /**
   * ヘルスチェックで起動完了を待つ
   */
  private async waitForReady(timeoutMs: number): Promise<void> {
    const start = Date.now();
    const interval = 500;

    while (Date.now() - start < timeoutMs) {
      try {
        const res = await axios.get(`http://127.0.0.1:${this.port}/health`, {
          timeout: 2000,
        });
        if (res.status === 200) {
          console.log('llama-server 起動完了');
          return;
        }
      } catch {
        // まだ起動中
      }

      // プロセスが落ちていたらエラー
      if (!this.process) {
        throw new Error('llama-server の起動に失敗しました。');
      }

      await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error('llama-server の起動がタイムアウトしました（60秒）。');
  }

  /**
   * llama-server を停止
   */
  stop(): void {
    if (!this.process) return;

    console.log('llama-server を停止中...');
    const proc = this.process;
    const pid = proc.pid;
    this.process = null;

    if (process.platform === 'win32' && pid) {
      // Windows: taskkill でプロセスツリーごと終了
      try {
        exec(`taskkill /PID ${pid} /T /F`, (error) => {
          if (error) {
            console.log('taskkill エラー（既に終了済みの可能性）:', error.message);
          }
        });
      } catch {
        // ignore
      }
    } else {
      try {
        proc.kill('SIGTERM');
      } catch {
        // ignore
      }

      // 3秒後にまだ生きていたら SIGKILL
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore - already dead
        }
      }, 3000);
    }
  }

  /**
   * プロセスが動作中か
   */
  isRunning(): boolean {
    return this.process !== null;
  }

  /**
   * 現在のポートを取得
   */
  getPort(): number {
    return this.port;
  }

  /**
   * 現在ロード中のモデルパスを取得
   */
  getModelPath(): string {
    return this.modelPath;
  }

  /**
   * ヘルスチェック（即時）
   */
  async healthCheck(): Promise<boolean> {
    if (!this.process) return false;
    try {
      const res = await axios.get(`http://127.0.0.1:${this.port}/health`, {
        timeout: 3000,
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }
}

// シングルトン
let instance: LlamaServerManager | null = null;

export function getLlamaServerManager(): LlamaServerManager {
  if (!instance) {
    instance = new LlamaServerManager();
  }
  return instance;
}
