import { clipboard, ipcMain } from 'electron';
import { EventEmitter } from 'events';
import { ClipboardEvent } from '../types';

/**
 * クリップボード監視サービス
 * ccトリガー（コピー2回）を検出
 */
export class ClipboardMonitor extends EventEmitter {
  private lastClipboardText: string = '';
  private lastCopyTime: number = 0;
  private copyCount: number = 0;
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private threshold: number = 500; // ミリ秒
  private resetTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * 監視を開始
   */
  start(threshold: number = 500): void {
    this.threshold = threshold;
    this.monitorInterval = setInterval(() => {
      this.checkClipboard();
    }, 100);
  }

  /**
   * 監視を停止
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout);
      this.resetTimeout = null;
    }
  }

  /**
   * クリップボードをチェック
   */
  private checkClipboard(): void {
    try {
      const currentText = clipboard.readText();

      // テキストが変わった場合
      if (currentText !== this.lastClipboardText && currentText.trim().length > 0) {
        this.lastClipboardText = currentText;
        const now = Date.now();

        // 前回のコピーから閾値以内の場合、カウントを増やす
        if (now - this.lastCopyTime <= this.threshold) {
          this.copyCount++;
        } else {
          // 閾値を超えた場合、カウントをリセット
          this.copyCount = 1;
        }

        this.lastCopyTime = now;

        // リセットタイマーをセット
        if (this.resetTimeout) {
          clearTimeout(this.resetTimeout);
        }
        this.resetTimeout = setTimeout(() => {
          this.copyCount = 0;
        }, this.threshold * 2);

        // ccトリガー（2回コピー）を検出
        if (this.copyCount === 2) {
          this.emit('cc-triggered', {
            text: currentText,
            timestamp: now,
            count: this.copyCount,
          } as ClipboardEvent);

          // カウントをリセット
          this.copyCount = 0;
        }

        // 3回コピーの場合（誤爆対策オプション用）
        if (this.copyCount === 3) {
          this.emit('triple-copy-triggered', {
            text: currentText,
            timestamp: now,
            count: this.copyCount,
          } as ClipboardEvent);

          // カウントをリセット
          this.copyCount = 0;
        }
      }
    } catch (error) {
      console.error('Error reading clipboard:', error);
    }
  }

  /**
   * クリップボードにテキストを書き込み
   */
  static writeText(text: string): void {
    clipboard.writeText(text);
  }

  /**
   * クリップボードからテキストを読み込み
   */
  static readText(): string {
    return clipboard.readText();
  }
}

/**
 * グローバルホットキーリスナーの登録
 */
export function setupClipboardIPC(monitor: ClipboardMonitor): void {
  ipcMain.on('clipboard:start-monitor', (event, threshold: number) => {
    monitor.start(threshold);
    event.reply('clipboard:monitor-started');
  });

  ipcMain.on('clipboard:stop-monitor', () => {
    monitor.stop();
  });

  ipcMain.handle('clipboard:read', () => {
    return ClipboardMonitor.readText();
  });

  ipcMain.handle('clipboard:write', (event, text: string) => {
    ClipboardMonitor.writeText(text);
  });

  // ccトリガーイベントをレンダラープロセスに送信
  monitor.on('cc-triggered', (event: ClipboardEvent) => {
    // メインウィンドウに通知
    const { BrowserWindow } = require('electron');
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win: any) => {
      win.webContents.send('clipboard:cc-triggered', event);
    });
  });

  monitor.on('triple-copy-triggered', (event: ClipboardEvent) => {
    const { BrowserWindow } = require('electron');
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win: any) => {
      win.webContents.send('clipboard:triple-copy-triggered', event);
    });
  });
}
