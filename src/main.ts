import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import * as path from 'path';
import isDev from 'electron-is-dev';
import { ClipboardMonitor, setupClipboardIPC } from './services/ClipboardMonitor';
import { getSettingsManager } from './services/SettingsManager';
import { OpenAIProvider } from './services/OpenAIProvider';
import { AIRequest, Language, AIMode } from './types';

const isDev_check = isDev || process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let clipboardMonitor: ClipboardMonitor;
let aiProvider: OpenAIProvider | null = null;

/**
 * メインウィンドウを作成
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../public/index.html')}`;

  mainWindow.loadURL(startUrl);

  // デバッグモード
  if (isDev_check) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
}

/**
 * アプリケーション初期化
 */
app.on('ready', () => {
  createWindow();

  // クリップボード監視を開始
  clipboardMonitor = new ClipboardMonitor();
  const settings = getSettingsManager().getSettings();
  clipboardMonitor.start(settings.shortcut.doubleCopyThreshold);
  setupClipboardIPC(clipboardMonitor);

  // APIプロバイダーを初期化
  initializeAIProvider();

  // IPC ハンドラーをセットアップ
  setupIPCHandlers();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

/**
 * AIプロバイダーを初期化
 */
async function initializeAIProvider(): Promise<void> {
  try {
    const settingsManager = getSettingsManager();
    const apiKey = await settingsManager.getAPIKey();

    if (apiKey) {
      const settings = settingsManager.getSettings();
      aiProvider = new OpenAIProvider(
        apiKey,
        settings.provider.model,
        settings.provider.apiEndpoint,
        settings.provider.maxTokensPerRequest
      );

      // ヘルスチェック
      const isHealthy = await aiProvider.healthCheck();
      if (!isHealthy) {
        console.warn('AI provider health check failed');
      }
    }
  } catch (error) {
    console.error('Error initializing AI provider:', error);
  }
}

/**
 * IPC ハンドラーをセットアップ
 */
function setupIPCHandlers(): void {
  // AI生成リクエスト
  ipcMain.handle('ai:generate', async (event, request: AIRequest) => {
    try {
      if (!aiProvider) {
        throw new Error('AIプロバイダーが初期化されていません。APIキーを設定してください。');
      }

      const settingsManager = getSettingsManager();

      // 除外アプリをチェック
      // TODO: フォーカスされたアプリを取得して確認

      // 除外パターンをチェック
      if (settingsManager.isTextExcluded(request.inputText)) {
        throw new Error('このテキストは送信が禁止されています。');
      }

      const response = await aiProvider.generate(request);
      return response;
    } catch (error: any) {
      return {
        error: error.message || 'Unknown error occurred',
      };
    }
  });

  // 設定取得
  ipcMain.handle('settings:get', () => {
    return getSettingsManager().getSettings();
  });

  // 設定保存
  ipcMain.handle('settings:save', async (event, settings: any) => {
    try {
      await getSettingsManager().saveSettings(settings);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // APIキー設定
  ipcMain.handle('settings:set-api-key', async (event, apiKey: string) => {
    try {
      await getSettingsManager().setAPIKey(apiKey);
      await initializeAIProvider();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // APIキー削除
  ipcMain.handle('settings:delete-api-key', async () => {
    try {
      await getSettingsManager().deleteAPIKey();
      aiProvider = null;
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 言語推定
  ipcMain.handle('ai:estimate', async (event, text: string) => {
    try {
      if (!aiProvider) {
        throw new Error('AIプロバイダーが初期化されていません。');
      }
      return await aiProvider.estimate(text);
    } catch (error: any) {
      return { error: error.message };
    }
  });

  // ウィンドウ制御
  ipcMain.handle('window:toggle', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });
}
