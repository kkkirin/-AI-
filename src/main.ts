import { app, BrowserWindow, Menu, ipcMain, Tray, nativeImage, clipboard, globalShortcut, shell, dialog, systemPreferences } from 'electron';
import * as path from 'path';
import { exec, spawn, ChildProcess } from 'child_process';
import isDev from 'electron-is-dev';
import { setupClipboardIPC } from './services/ClipboardMonitor';
import { getSettingsManager } from './services/SettingsManager';
import { LocalAIProvider } from './services/LocalAIProvider';
import { OpenAIProvider } from './services/OpenAIProvider';
import { CLIProvider } from './services/CLIProvider';
import { getLlamaServerManager } from './services/LlamaServerManager';
import { getKeyboardTriggerMonitor } from './services/KeyboardTriggerMonitor';
import { getModelManager, DEFAULT_MODELS } from './services/ModelManager';
import { AIProvider } from './services/AIProvider';
import { AIRequest, Language, AIMode, ProviderType } from './types';

// ストリームエラーを無視（ターミナル切断時のエラー防止）
process.stdout.on('error', () => {});
process.stderr.on('error', () => {});

const isDev_check =
  process.env.CC_AI_DEVTOOLS === '1' ||
  process.env.CC_AI_DEVTOOLS === 'true' ||
  isDev ||
  process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let aiProvider: AIProvider | null = null;
let tray: Tray | null = null;
let currentShortcut: string | null = null;
let currentTriggerType: 'hotkey' | 'double_copy' | null = null;
let currentShortcutHandler: (() => void) | null = null;
let isQuitting = false;
let forceQuit = false;
let isShowingWindow = false;
let rendererReady = false;
let pendingCC: { text: string; mode?: AIMode } | null = null;


function getDefaultHotkey(): string {
  return process.platform === 'darwin' ? 'Command+Shift+V' : 'Ctrl+Shift+V';
}

function getConfiguredLocalServerPort(): number {
  const port = getSettingsManager().getSettings().provider.localServerPort;
  return port || 8080;
}

function getLocalAIEndpoint(port: number = getConfiguredLocalServerPort()): string {
  return `http://127.0.0.1:${port}/v1`;
}

/**
 * ウィンドウを表示し、macOS では Dock/Cmd+Tab にも表示
 */
function showWindow(): void {
  if (isShowingWindow) return; // 再入防止
  isShowingWindow = true;
  try {
    if (process.platform === 'darwin') {
      app.dock.show();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  } finally {
    isShowingWindow = false;
  }
}

/**
 * ウィンドウを非表示にし、macOS では Dock/Cmd+Tab からも消す
 */
function hideWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
}

/**
 * メインウィンドウを作成
 */
function createWindow(): void {
  // 既にウィンドウが存在する場合は表示するだけ
  if (mainWindow && !mainWindow.isDestroyed()) {
    showWindow();
    return;
  }

  // アプリアイコンを読み込み
  const iconPath = path.join(__dirname, '../assets/icon-512.png');
  let appIcon: Electron.NativeImage | undefined;
  try {
    appIcon = nativeImage.createFromPath(iconPath);
    if (appIcon.isEmpty()) {
      appIcon = undefined;
    }
  } catch {
    appIcon = undefined;
  }

  mainWindow = new BrowserWindow({
    width: 500,
    height: 700,
    icon: appIcon,
    backgroundColor: '#1e1e1e', // 白フラッシュ防止（アプリのダーク背景に合わせる）
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
    skipTaskbar: false, // タスクバーに表示
    alwaysOnTop: false, // 常に前面に表示しない（必要に応じて変更可能）
  });

  // ローカルファイルから読み込み（開発サーバーを使わない）
  const startUrl = `file://${path.join(__dirname, 'index.html')}`;
  mainWindow.loadURL(startUrl);
  rendererReady = false;
  mainWindow.webContents.on('did-start-loading', () => {
    rendererReady = false;
  });

  // デバッグモード
  if (isDev_check) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // ウィンドウを閉じても非表示にするだけ（トレイに残す）
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideWindow();
    } else {
      mainWindow = null;
    }
  });

  mainWindow.on('closed', () => {
    if (process.platform !== 'darwin') {
      mainWindow = null;
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
}

function dispatchCCTrigger(text: string, mode?: AIMode): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }

  showWindow();

  const alive =
    mainWindow &&
    !mainWindow.isDestroyed() &&
    mainWindow.webContents &&
    !mainWindow.webContents.isDestroyed();

  if (rendererReady && alive && mainWindow) {
    mainWindow.webContents.send('clipboard:cc-triggered', {
      text,
      timestamp: Date.now(),
      count: mode ? 2 : 1,
      mode,
    });
  } else {
    pendingCC = { text, mode };
  }
}

/**
 * 赤い丸アイコンを作成（OS別にサイズを調整）
 */
function createRedIcon(): Electron.NativeImage {
  // Windowsでは大きめのアイコン、macOSでは小さめ
  const size = process.platform === 'win32' ? 32 : 16;
  const buffer = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size / 2 - 1;
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // 中心からの距離を計算
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist <= radius) {
        // 赤い円
        buffer[idx] = 255;     // R
        buffer[idx + 1] = 0;   // G
        buffer[idx + 2] = 0;   // B
        buffer[idx + 3] = 255; // A
      } else {
        // 透明
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 0;
      }
    }
  }
  
  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

/**
 * システムトレイを作成
 */
function createTray(): void {
  // カスタムアイコンを読み込み（なければフォールバック）
  const trayIconPath = path.join(__dirname, '../assets/tray-icon.png');
  let icon: Electron.NativeImage;

  console.log('[tray] アイコンパス:', trayIconPath);

  try {
    icon = nativeImage.createFromPath(trayIconPath);
    console.log('[tray] アイコン読み込み:', icon.isEmpty() ? '空' : `${icon.getSize().width}x${icon.getSize().height}`);
    // Retinaディスプレイ対応
    if (process.platform === 'darwin') {
      const trayIcon2xPath = path.join(__dirname, '../assets/tray-icon@2x.png');
      const icon2x = nativeImage.createFromPath(trayIcon2xPath);
      if (!icon2x.isEmpty()) {
        icon = icon2x;
        console.log('[tray] @2xアイコン使用:', `${icon.getSize().width}x${icon.getSize().height}`);
      }
    }
    if (icon.isEmpty()) {
      console.log('[tray] アイコンが空、フォールバック使用');
      icon = createRedIcon();
    }
  } catch (e) {
    console.error('[tray] アイコン読み込みエラー:', e);
    icon = createRedIcon();
  }
  
  tray = new Tray(icon);
  tray.setToolTip('QuickText - AI翻訳・文章変換');
  
  // macOSではタイトルも表示（より見やすく）
  if (process.platform === 'darwin') {
    tray.setTitle('QT');
  }

  // 右クリックメニューを設定
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '📋 クリップボードをAI処理',
      click: () => {
        triggerClipboardAI();
      },
    },
    { type: 'separator' },
    {
      label: '🔄 翻訳モード',
      click: () => {
        triggerClipboardAI(AIMode.TRANSLATE);
      },
    },
    {
      label: '📝 要約モード',
      click: () => {
        triggerClipboardAI(AIMode.SUMMARIZE);
      },
    },
    {
      label: '✍️ 校正モード',
      click: () => {
        triggerClipboardAI(AIMode.PROOFREADING);
      },
    },
    {
      label: '🎯 丁寧語モード',
      click: () => {
        triggerClipboardAI(AIMode.POLITE);
      },
    },
    {
      label: '🔄 フランクモード',
      click: () => {
        triggerClipboardAI(AIMode.REPHRASE);
      },
    },
    { type: 'separator' },
    {
      label: '⚙️ 設定を開く',
      click: () => {
        showWindow();
      },
    },
    {
      label: '❌ 終了',
      click: () => {
        forceQuit = true;
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // 左クリックでウィンドウを表示/非表示
  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) {
      hideWindow();
    } else {
      showWindow();
    }
  });
}

/**
 * クリップボードのテキストをAI処理にトリガー（自動生成）
 */
async function triggerClipboardAI(mode?: AIMode): Promise<void> {
  const text = clipboard.readText();
  if (text && text.trim().length > 0) {
    // ウィンドウが破棄されている場合は再作成
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      // ウィンドウが準備できるまで少し待つ
      setTimeout(async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          await sendClipboardEventAndAutoGenerate(text, mode);
        }
      }, 500);
      return;
    }

    // メインウィンドウに通知して自動生成
    await sendClipboardEventAndAutoGenerate(text, mode);
  }
}

/**
 * クリップボードイベントを送信して自動生成を実行
 */
async function sendClipboardEventAndAutoGenerate(text: string, mode?: AIMode): Promise<void> {
  dispatchCCTrigger(text, mode);
}

/**
 * 選択テキストをコピーしてクリップボードから読み込む
 */
async function simulateCopyAndReadClipboard(): Promise<{ text: string; success: boolean }> {
  return new Promise((resolve) => {
    const readClipboardAfterDelay = (success: boolean) => {
      setTimeout(() => {
        const text = clipboard.readText();
        resolve({ text, success });
      }, 100);
    };

    if (process.platform === 'darwin') {
      // macOS: AppleScriptでCmd+Cをシミュレート
      const script = 'tell application "System Events" to keystroke "c" using command down';

      exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
        if (error) {
          console.error('AppleScript実行エラー:', error.message);
          console.error('stderr:', stderr);
          readClipboardAfterDelay(false);
          return;
        }
        readClipboardAfterDelay(true);
      });
    } else if (process.platform === 'win32') {
      // Windows: PowerShellでCtrl+Cをシミュレート
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait("^c")
      `;
      exec(`powershell -Command "${psScript.replace(/\n/g, ' ')}"`, (error) => {
        if (error) {
          console.error('PowerShell実行エラー:', error.message);
          readClipboardAfterDelay(false);
          return;
        }
        readClipboardAfterDelay(true);
      });
    } else {
      // Linux: xdotoolでCtrl+Cをシミュレート
      exec('xdotool key ctrl+c', (error) => {
        if (error) {
          console.error('xdotool実行エラー:', error.message);
          readClipboardAfterDelay(false);
          return;
        }
        readClipboardAfterDelay(true);
      });
    }
  });
}

/**
 * F12キーで選択テキストをコピー→アプリを開く→クリップボードの内容を挿入
 */
async function handleF12Shortcut(): Promise<void> {
  try {
    console.log('F12キーが押されました - 選択テキストをコピーします');
    const { text } = await simulateCopyAndReadClipboard();
    console.log('クリップボードの内容:', text ? `"${text.substring(0, 50)}..."` : '(空)');

    if (text && text.trim().length > 0) {
      openAppWithText(text);
    } else {
      console.warn('クリップボードが空です');
    }
  } catch (error) {
    console.error('F12ショートカット処理エラー:', error);
  }
}

/**
 * クリップボードがテキストのみかチェック（ホワイトリスト方式）
 * テキスト系フォーマットだけなら true → ダブルコピー検出OK
 * ファイル・画像等が含まれていたら false → 触らない
 */
const TEXT_ONLY_FORMATS = new Set(['text/plain', 'text/html', 'text/rtf']);

function isTextOnlyClipboard(): boolean {
  try {
    const formats = clipboard.availableFormats();
    if (formats.length === 0) return false;
    const result = formats.every(f => TEXT_ONLY_FORMATS.has(f));
    if (!result) {
      console.log('[clipboard] non-text formats detected, skipping double-copy:', JSON.stringify(formats));
    }
    return result;
  } catch {
    return false;
  }
}

const onDoubleCopyTrigger = (): void => {
  if (!isTextOnlyClipboard()) return;

  const text = clipboard.readText();
  if (text && text.trim().length > 0) {
    openAppWithText(text);
  }
};

/**
 * アプリを開いてテキストを入力欄に挿入
 */
function openAppWithText(text: string): void {
  console.log('アプリを開いてテキストを挿入:', text.substring(0, 50));
  dispatchCCTrigger(text);
}

/**
 * グローバルショートカットを登録
 */
function registerGlobalShortcut(shortcut: string): boolean {
  // 既存のショートカットを解除
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut);
  }

  try {
    const success = globalShortcut.register(shortcut, () => {
      console.log('ショートカットが押されました:', shortcut);
      triggerClipboardAI();
    });

    if (success) {
      currentShortcut = shortcut;
      console.log('グローバルショートカットを登録しました:', shortcut);
      return true;
    } else {
      console.warn('ショートカットの登録に失敗しました:', shortcut);
      return false;
    }
  } catch (error) {
    console.error('ショートカット登録エラー:', error);
    return false;
  }
}

/**
 * ショートカットを設定に応じて初期化
 */
function setupTriggers(): void {
  const settings = getSettingsManager().getSettings();
  const triggerType = settings.shortcut.triggerType || 'hotkey';
  const isDoubleCopyEnabled = triggerType === 'double_copy';
  const normalizedTriggerType: 'hotkey' | 'double_copy' = isDoubleCopyEnabled ? 'double_copy' : 'hotkey';

  // グローバルショートカット
  let targetShortcut = '';
  let onTrigger: () => void;

  if (isDoubleCopyEnabled) {
    if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
      console.warn('[keyboard-trigger] accessibility permission is not granted');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('permissions:accessibility-status', { granted: false });
      }
    }

    getKeyboardTriggerMonitor().start(onDoubleCopyTrigger);
    targetShortcut = '';
    onTrigger = () => {};
  } else {
    getKeyboardTriggerMonitor().stop();

    const defaultShortcut = getDefaultHotkey();
    targetShortcut = settings.shortcut.alternateHotkey || defaultShortcut;

    // WindowsではCommandをCtrlに変換
    if (process.platform === 'win32' && targetShortcut.includes('Command')) {
      targetShortcut = targetShortcut.replace(/Command/g, 'Ctrl');
      console.log('Windows用にショートカットを変換:', targetShortcut);
    }

    onTrigger = () => {
      console.log('ショートカットが押されました:', targetShortcut);
      handleF12Shortcut(); // コピー→アプリを開く→挿入
    };
  }
  
  // 既に同じショートカットが登録されている場合はスキップ
  if (currentShortcut === targetShortcut && currentTriggerType === normalizedTriggerType) {
    console.log('同じショートカットが既に登録されています:', currentShortcut);
    return;
  }
  
  // 既存のトリガーを解除
  if (currentShortcut) {
    console.log('既存のショートカットを解除:', currentShortcut);
    globalShortcut.unregister(currentShortcut);
    currentShortcut = null;
    currentTriggerType = null;
    currentShortcutHandler = null;
  }
  
  // Windowsでは少し遅延させて登録（アプリの初期化を待つ）
  const registerShortcut = () => {
    try {
      if (!targetShortcut) {
        currentTriggerType = normalizedTriggerType;
        return;
      }

      currentShortcutHandler = onTrigger;
      const success = globalShortcut.register(targetShortcut, onTrigger);
      
      if (success) {
        currentShortcut = targetShortcut;
        currentTriggerType = normalizedTriggerType;
        console.log('グローバルショートカットを登録しました:', targetShortcut);
        console.log('登録されたショートカット:', globalShortcut.isRegistered(targetShortcut));
      } else {
        console.warn('ショートカットの登録に失敗しました:', targetShortcut);
        console.warn('利用可能なショートカットを確認してください');
      }
    } catch (error) {
      console.error('ショートカット登録エラー:', error);
    }
  };
  
  if (process.platform === 'win32') {
    // Windowsでは少し遅延させて登録
    if (targetShortcut) {
      setTimeout(registerShortcut, 500);
    } else {
      registerShortcut();
    }
  } else {
    registerShortcut();
  }
}

/**
 * アプリケーション初期化
 */
app.whenReady().then(async () => {
  createWindow();
  try {
    createTray();
    console.log('[init] トレイ作成成功, tray =', tray ? 'OK' : 'null');
  } catch (e) {
    console.error('[init] トレイ作成失敗:', e);
  }

  // 設定を読み込んでデフォルトを設定
  const settings = getSettingsManager().getSettings();
  if (!settings.shortcut.triggerType) {
    settings.shortcut.triggerType = 'hotkey';
    settings.shortcut.alternateHotkey = settings.shortcut.alternateHotkey || getDefaultHotkey();
    getSettingsManager().saveSettings(settings);
  }

  // クリップボードIPCハンドラーをセットアップ
  setupClipboardIPC();

  // トリガー方法を設定（Windowsでは少し遅延させる）
  if (process.platform === 'win32') {
    // Windowsではウィンドウが準備できてからショートカットを登録
    setTimeout(() => {
      setupTriggers();
    }, 1000);
  } else {
    setupTriggers();
  }

  // IPC ハンドラーをセットアップ
  setupIPCHandlers();

  // APIプロバイダーを初期化
  await broadcastAIStatus({ running: true, ready: false });
  await initializeAIProvider();
  await broadcastAIStatus();

  if (aiProvider instanceof LocalAIProvider) {
    await broadcastAIStatus({ running: true, ready: false });
  }

  try {
    await warmupLocalAI();
  } catch {
    // ウォームアップ失敗は起動を妨げない
  }
  await broadcastAIStatus();
});

app.on('window-all-closed', () => {
  // トレイが有効な場合はアプリを終了しない（macOS/Windows共通）
  if (tray && !isQuitting) {
    return;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  // forceQuit: トレイの「終了」ボタンからのみ true になる
  if (forceQuit) {
    console.log('[quit] forceQuit=true, 完全に終了します');
    isQuitting = true;
    getKeyboardTriggerMonitor().stop();
    getLlamaServerManager().stop();
    void broadcastAIStatus();
    if (tray) {
      tray.destroy();
      tray = null;
    }
    return;
  }

  // まず終了をキャンセル（何が起きても落ちないようにする）
  let closeAction: string = 'minimize_to_tray';
  try {
    closeAction = getSettingsManager().getSettings().ui.closeAction || 'minimize_to_tray';
  } catch (e) {
    console.error('[quit] 設定読み込みエラー、トレイに常駐:', e);
  }

  console.log('[quit] before-quit fired, closeAction=' + closeAction);

  if (closeAction === 'quit') {
    // 「そのまま終了する」設定の場合のみ終了を許可
    isQuitting = true;
    getKeyboardTriggerMonitor().stop();
    getLlamaServerManager().stop();
    void broadcastAIStatus();
    if (tray) {
      tray.destroy();
      tray = null;
    }
    return;
  }

  // minimize_to_tray / confirm: 終了を阻止
  event.preventDefault();

  if (closeAction === 'minimize_to_tray') {
    console.log('[quit] トレイに常駐します');
    hideWindow();
    return;
  }

  // confirm: 確認ダイアログを表示
  if (!mainWindow || mainWindow.isDestroyed()) {
    // ウィンドウが無い場合はトレイに常駐（落とさない）
    console.log('[quit] ウィンドウなし、トレイに常駐します');
    return;
  }

  dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['トレイに常駐', '完全に終了'],
    defaultId: 0,
    cancelId: 0,
    title: 'QuickText',
    message: 'QuickText を終了しますか？',
    detail: 'トレイに常駐すると、メニューバーからいつでも呼び出せます。',
  }).then(({ response }) => {
    if (response === 1) {
      forceQuit = true;
      app.quit();
    } else {
      hideWindow();
    }
  });
});

app.on('will-quit', () => {
  // すべてのショートカットを解除
  globalShortcut.unregisterAll();
  // llama-server 二重停止保険
  getKeyboardTriggerMonitor().stop();
  getLlamaServerManager().stop();
  void broadcastAIStatus();
});

// プロセス終了時のフォールバック
process.on('exit', () => {
  getKeyboardTriggerMonitor().stop();
  getLlamaServerManager().stop();
  void broadcastAIStatus();
});

app.on('activate', () => {
  // showWindow() → app.dock.show() が activate を発火させる循環を防止
  if (isShowingWindow) return;

  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  } else if (!mainWindow.isVisible()) {
    showWindow();
  }
});

/**
 * llama-server を起動（モデルが必要）
 */
async function startLlamaServer(): Promise<{ success: boolean; message: string }> {
  const llamaManager = getLlamaServerManager();
  const modelManager = getModelManager();

  if (llamaManager.isRunning()) {
    return { success: true, message: 'AI推論エンジンは既に起動しています' };
  }

  const models = modelManager.getAvailableModels();
  if (models.length === 0) {
    return { success: false, message: 'AIモデルがダウンロードされていません。セットアップからモデルをダウンロードしてください。' };
  }

  try {
    const modelPath = modelManager.resolveExistingModelPath(models[0]) ?? modelManager.getModelPath(models[0]);
    await llamaManager.start(modelPath, getConfiguredLocalServerPort());
    return { success: true, message: 'AI推論エンジンを起動しました' };
  } catch (error: any) {
    return { success: false, message: `AI推論エンジンの起動に失敗しました: ${error.message}` };
  }
}

/**
 * AIプロバイダーを初期化
 */
async function initializeAIProvider(): Promise<void> {
  try {
    const settingsManager = getSettingsManager();
    const settings = settingsManager.getSettings();
    aiProvider = null;

    if (settings.provider.type === ProviderType.API) {
      const apiKey = await settingsManager.getAPIKey();
      const endpoint = settings.provider.apiEndpoint?.trim();
      const model = settings.provider.model?.trim() || 'gpt-4o-mini';
      aiProvider = new OpenAIProvider(
        apiKey || process.env.OPENAI_API_KEY,
        model,
        endpoint,
        settings.provider.maxTokensPerRequest
      );
      console.log('OpenAI互換APIプロバイダーを初期化しました:', endpoint || 'https://api.openai.com/v1');
      return;
    }

    if (settings.provider.type === ProviderType.CLI) {
      const cliProvider = settings.provider.cliProvider || 'codex';
      const provider = new CLIProvider({
        provider: cliProvider,
        command: settings.provider.cliCommand,
        model: settings.provider.model,
        maxTokens: settings.provider.maxTokensPerRequest,
      });
      const isHealthy = await provider.healthCheck();
      if (!isHealthy) {
        throw new Error(
          cliProvider === 'codex'
            ? 'Codex CLI が見つかりません。codex コマンドをインストール/ログインしてください。'
            : 'Claude Code が見つかりません。claude コマンドをインストール/ログインしてください。'
        );
      }
      aiProvider = provider;
      console.log('CLI AIプロバイダーを初期化しました:', cliProvider);
      return;
    }

    const modelManager = getModelManager();
    const llamaManager = getLlamaServerManager();
    const localServerPort = getConfiguredLocalServerPort();

    if (llamaManager.isRunning() && llamaManager.getPort() !== localServerPort) {
      llamaManager.stop();
      await broadcastAIStatus();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // ダウンロード済みモデルを確認
    const models = modelManager.getAvailableModels();
    if (models.length === 0) {
      console.warn('AIモデルが未ダウンロードです');
      aiProvider = null;
      return;
    }

    // llama-serverが起動していなければ起動
    if (!llamaManager.isRunning()) {
      const modelPath = modelManager.resolveExistingModelPath(models[0]) ?? modelManager.getModelPath(models[0]);
      await llamaManager.start(modelPath, localServerPort);
    }

    // プロバイダーを作成
    const port = llamaManager.getPort();
    const endpoint = getLocalAIEndpoint(port);
    aiProvider = new LocalAIProvider(endpoint);

    // ヘルスチェック
    const isHealthy = await aiProvider.healthCheck();
    if (isHealthy) {
      console.log('AI推論エンジン（llama-server）に接続しました');
      return;
    } else {
      console.warn('AI推論エンジンに接続できません');
      aiProvider = null;
    }
  } catch (error) {
    console.error('Error initializing AI provider:', error);
    aiProvider = null;
  }
}

interface LocalAIStatus {
  providerType: ProviderType;
  running: boolean;
  ready: boolean;
  modelId: string | null;
  modelName: string;
  endpoint: string | null;
  port: number | null;
}

async function getAIStatus(): Promise<LocalAIStatus> {
  const settings = getSettingsManager().getSettings();
  const providerType = settings.provider.type;

  if (providerType !== ProviderType.LOCAL) {
    const providerName = providerType === ProviderType.API
      ? settings.provider.apiProvider || 'API'
      : settings.provider.cliProvider || 'CLI';
    const modelName = settings.provider.model?.trim() || providerName;

    return {
      providerType,
      running: aiProvider !== null,
      ready: aiProvider !== null,
      modelId: settings.provider.model?.trim() || null,
      modelName,
      endpoint: null,
      port: null,
    };
  }

  const llamaManager = getLlamaServerManager();
  const modelManager = getModelManager();
  const running = llamaManager.isRunning();
  const ready = running ? await llamaManager.healthCheck() : false;
  const loadedFilename = llamaManager.getModelPath()
    ? path.basename(llamaManager.getModelPath())
    : null;
  const modelId = (
    loadedFilename
      ? DEFAULT_MODELS.find((model) => model.filename === loadedFilename)?.id
      : null
  ) ?? modelManager.getAvailableModels()[0] ?? null;
  const port = llamaManager.getPort() || getConfiguredLocalServerPort();

  return {
    providerType,
    running,
    ready,
    modelId,
    modelName: modelId ? modelManager.getModelDisplayName(modelId) : 'ローカルAI',
    endpoint: getLocalAIEndpoint(port),
    port,
  };
}

async function broadcastAIStatus(overrides: Partial<LocalAIStatus> = {}): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }

  try {
    const status = await getAIStatus();
    mainWindow.webContents.send('local-ai:status-changed', { ...status, ...overrides });
  } catch (error) {
    console.warn('AI状態の通知に失敗しました:', error);
  }
}

async function warmupLocalAI(): Promise<void> {
  if (!(aiProvider instanceof LocalAIProvider)) {
    return;
  }

  if (!(await aiProvider.healthCheck())) {
    return;
  }

  await aiProvider.warmup();
}

/**
 * IPC ハンドラーをセットアップ
 */
function setupIPCHandlers(): void {
  ipcMain.on('renderer:ready', () => {
    rendererReady = true;
    if (
      pendingCC &&
      mainWindow &&
      !mainWindow.isDestroyed() &&
      !mainWindow.webContents.isDestroyed()
    ) {
      const { text, mode } = pendingCC;
      pendingCC = null;
      mainWindow.webContents.send('clipboard:cc-triggered', {
        text,
        timestamp: Date.now(),
        count: mode ? 2 : 1,
        mode,
      });
    }
  });

  ipcMain.handle('permissions:check-accessibility', () =>
    process.platform !== 'darwin' ? true : systemPreferences.isTrustedAccessibilityClient(false),
  );
  ipcMain.handle('permissions:request-accessibility', () =>
    process.platform !== 'darwin' ? true : systemPreferences.isTrustedAccessibilityClient(true),
  );
  ipcMain.handle('permissions:reapply-triggers', () => {
    try {
      setupTriggers();
    } catch (e) {
      console.error('reapply-triggers error:', e);
    }
    return process.platform !== 'darwin' ? true : systemPreferences.isTrustedAccessibilityClient(false);
  });

  // AI生成リクエスト
    ipcMain.handle('ai:generate', async (event, request: AIRequest) => {
      try {
      if (!aiProvider) {
        // 再接続を試みる
        await initializeAIProvider();
        if (!aiProvider) {
          throw new Error('AI推論エンジンに接続できません。モデルがダウンロードされているか確認してください。');
        }
      }

      const settingsManager = getSettingsManager();

      // 除外アプリをチェック
      // TODO: フォーカスされたアプリを取得して確認

      // 除外パターンをチェック
      const textExclusionMatch = settingsManager.getTextExclusionMatch(request.inputText);
      if (textExclusionMatch) {
        console.warn('[privacy] 送信をブロックしました。除外パターン:', textExclusionMatch.pattern);
        throw new Error(`このテキストは送信が禁止されています（除外パターンに一致: ${textExclusionMatch.pattern}）。`);
      }

      const response = await aiProvider.generate(request);
      return response;
    } catch (error: any) {
      return {
        error: error.message || 'Unknown error occurred',
        };
      }
    });

    ipcMain.handle('ai:generate-stream', async (
      event,
      payload: { request: AIRequest; requestId: string }
    ) => {
      try {
        const { request, requestId } = payload;
        if (!aiProvider) {
          await initializeAIProvider();
          if (!aiProvider) {
            throw new Error('AI推論エンジンに接続できません。モデルがダウンロードされているか確認してください。');
          }
        }

        const settingsManager = getSettingsManager();
        const textExclusionMatch = settingsManager.getTextExclusionMatch(request.inputText);
        if (textExclusionMatch) {
          console.warn('[privacy] 送信をブロックしました。除外パターン:', textExclusionMatch.pattern);
          throw new Error(`このテキストは送信が禁止されています（除外パターンに一致: ${textExclusionMatch.pattern}）。`);
        }

        if (typeof aiProvider.generateStream === 'function') {
          return await aiProvider.generateStream(request, (token: string) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send('ai:stream-token', { requestId, token });
            }
          });
        }

        return await aiProvider.generate(request);
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
      // トリガー方法を再設定
      setupTriggers();
      await initializeAIProvider();
      await broadcastAIStatus();
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

  // APIキー設定状態
  ipcMain.handle('settings:has-api-key', async () => {
    try {
      return { success: true, hasAPIKey: await getSettingsManager().hasAPIKey() };
    } catch (error: any) {
      return { success: false, hasAPIKey: false, error: error.message };
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

  // ローカルAI: ダウンロード済みモデル一覧取得
  ipcMain.handle('local-ai:get-models', async () => {
    try {
      const modelManager = getModelManager();
      const models = modelManager.getAvailableModels();
      return { success: true, models };
    } catch (error: any) {
      return { success: false, error: error.message, models: [] };
    }
  });

  // ローカルAI: 接続確認（llama-serverヘルスチェック）
  ipcMain.handle('local-ai:check-connection', async () => {
    try {
      const llamaManager = getLlamaServerManager();
      const isConnected = await llamaManager.healthCheck();
      return { success: true, connected: isConnected };
    } catch (error: any) {
      return { success: false, connected: false, error: error.message };
    }
  });

  // ローカルAI: 外部CLI向け OpenAI互換エンドポイント
  ipcMain.handle('local-ai:get-endpoint', async () => {
    try {
      const llamaManager = getLlamaServerManager();
      const running = llamaManager.isRunning();
      const port = running ? llamaManager.getPort() : getConfiguredLocalServerPort();
      return {
        success: true,
        running,
        port,
        endpoint: getLocalAIEndpoint(port),
      };
    } catch (error: any) {
      return {
        success: false,
        running: false,
        port: getConfiguredLocalServerPort(),
        endpoint: getLocalAIEndpoint(),
        error: error.message,
      };
    }
  });

  // ローカルAI: llama-serverを起動
  ipcMain.handle('local-ai:start-server', async () => {
    try {
      const result = await startLlamaServer();
      await broadcastAIStatus();
      return result;
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('local-ai:get-status', async () => getAIStatus());

  // ローカルAI: モデルがダウンロード済みかチェック
  ipcMain.handle('local-ai:check-model', async () => {
    try {
      const modelManager = getModelManager();
      const models = modelManager.getAvailableModels();
      return { success: true, hasModel: models.length > 0, models };
    } catch (error: any) {
      return { success: false, hasModel: false, error: error.message };
    }
  });

  // ローカルAI: 推奨モデル一覧
  ipcMain.handle('local-ai:get-recommended-models', () => {
    return DEFAULT_MODELS.map((m) => ({
      name: m.id,
      description: m.description,
      size: m.sizeLabel,
    }));
  });

  // ローカルAI: モデルダウンロード（Hugging Faceから）
  ipcMain.handle('local-ai:download-model', async (event, modelId: string) => {
    try {
      console.log('モデルダウンロード開始:', modelId);
      const modelManager = getModelManager();

      await modelManager.downloadModel(modelId, (downloaded, total) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
          mainWindow.webContents.send('local-ai:download-progress', {
            model: modelId,
            message: `${percent}%`,
            downloaded,
            total,
          });
        }
      });

      console.log('モデルダウンロード完了:', modelId);
      return { success: true };
    } catch (error: any) {
      console.error('モデルダウンロードエラー:', error.message);
      return { success: false, error: error.message };
    }
  });

  // 初回セットアップ完了フラグを取得
  ipcMain.handle('setup:is-completed', () => {
    const settings = getSettingsManager().getSettings();
    return (settings as any).setupCompleted === true;
  });

  // 初回セットアップ完了フラグを設定
  ipcMain.handle('setup:set-completed', async () => {
    const settingsManager = getSettingsManager();
    const settings = settingsManager.getSettings();
    (settings as any).setupCompleted = true;
    await settingsManager.saveSettings(settings);
    return { success: true };
  });

  // プロバイダー再初期化
  ipcMain.handle('ai:reinitialize', async () => {
    try {
      await initializeAIProvider();
      await broadcastAIStatus();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ショートカット: 現在のショートカットを取得
  ipcMain.handle('shortcut:get-current', () => {
    const settings = getSettingsManager().getSettings();
    if (settings.shortcut.triggerType === 'double_copy') {
      return process.platform === 'darwin' ? 'Command+C' : 'Ctrl+C';
    }
    const defaultShortcut = getDefaultHotkey();
    return currentShortcut || defaultShortcut;
  });

  // ショートカット: ショートカットを変更
  ipcMain.handle('shortcut:set', async (event, shortcut: string) => {
    try {
      const settingsManager = getSettingsManager();
      const settings = settingsManager.getSettings();
      if (settings.shortcut.triggerType === 'double_copy') {
        return { success: false, error: 'ダブルコピーが有効なため、ホットキーは変更できません。' };
      }

      const previousShortcut = currentShortcut;
      if (previousShortcut) {
        globalShortcut.unregister(previousShortcut);
      }

      // WindowsではCommandをCtrlに変換
      let normalizedShortcut = shortcut;
      if (process.platform === 'win32' && shortcut.includes('Command')) {
        normalizedShortcut = shortcut.replace(/Command/g, 'Ctrl');
        console.log('Windows用にショートカットを変換:', normalizedShortcut);
      }

      const handler = () => {
        console.log('ショートカットが押されました:', normalizedShortcut);
        handleF12Shortcut(); // コピー→アプリを開く→挿入
      };
      const success = globalShortcut.register(normalizedShortcut, handler);

      if (success) {
        currentShortcut = normalizedShortcut;
        currentTriggerType = 'hotkey';
        currentShortcutHandler = handler;
        // 設定を保存（元の形式で保存）
        settings.shortcut.alternateHotkey = shortcut;
        await settingsManager.saveSettings(settings);
        console.log('ショートカット登録成功:', normalizedShortcut);
        console.log('登録確認:', globalShortcut.isRegistered(normalizedShortcut));
        return { success: true, shortcut: normalizedShortcut };
      } else {
        console.warn('ショートカット登録失敗:', normalizedShortcut);
        if (previousShortcut) {
          const previousHandler = () => {
            console.log('ショートカットが押されました:', previousShortcut);
            handleF12Shortcut();
          };
          globalShortcut.register(previousShortcut, previousHandler);
          currentShortcut = previousShortcut;
          currentTriggerType = 'hotkey';
          currentShortcutHandler = previousHandler;
        }
        return { success: false, error: 'ショートカットの登録に失敗しました。他のアプリが使用している可能性があります。' };
      }
    } catch (error: any) {
      console.error('ショートカット設定エラー:', error);
      return { success: false, error: error.message };
    }
  });

  // ショートカット: 利用可能なショートカット一覧
  ipcMain.handle('shortcut:get-presets', () => {
    const isMac = process.platform === 'darwin';
    const presets = [
      { key: isMac ? 'Command+Shift+V' : 'Ctrl+Shift+V', label: isMac ? '⌘+Shift+V' : 'Ctrl+Shift+V' },
      { key: isMac ? 'Command+Shift+C' : 'Ctrl+Shift+C', label: isMac ? '⌘+Shift+C' : 'Ctrl+Shift+C' },
      { key: isMac ? 'Command+Shift+T' : 'Ctrl+Shift+T', label: isMac ? '⌘+Shift+T' : 'Ctrl+Shift+T' },
      { key: isMac ? 'Command+Shift+A' : 'Ctrl+Shift+A', label: isMac ? '⌘+Shift+A' : 'Ctrl+Shift+A' },
      { key: 'F9', label: 'F9' },
      { key: 'F10', label: 'F10' },
      { key: 'F11', label: 'F11' },
      { key: 'F12', label: 'F12' },
    ];
    return presets;
  });

  // ウィンドウ制御
  ipcMain.handle('window:toggle', () => {
    if (mainWindow && mainWindow.isVisible()) {
      hideWindow();
    } else {
      showWindow();
    }
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });
}
