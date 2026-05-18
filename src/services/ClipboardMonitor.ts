import { clipboard, ipcMain } from 'electron';

/**
 * クリップボードサービス
 * クリップボードの読み書きを提供
 */
export class ClipboardMonitor {
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
 * クリップボードIPCハンドラーの登録
 */
export function setupClipboardIPC(): void {
  ipcMain.handle('clipboard:read', () => {
    return ClipboardMonitor.readText();
  });

  ipcMain.handle('clipboard:write', (event, text: string) => {
    ClipboardMonitor.writeText(text);
  });
}
