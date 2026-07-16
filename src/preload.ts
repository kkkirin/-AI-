import { contextBridge, ipcRenderer } from 'electron';
import { AIRequest, AIResponse, AppSettings, ClipboardEvent } from './types';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  duration?: number;
  timestamp: number;
}

export interface LocalAIStatus {
  providerType: 'local' | 'api' | 'cli';
  running: boolean;
  ready: boolean;
  modelId: string | null;
  modelName: string;
  endpoint: string | null;
  port: number | null;
}

/**
 * Preload スクリプト
 * レンダラープロセスに安全なAPI を公開
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // AI生成
  generateAI: (request: AIRequest) => ipcRenderer.invoke('ai:generate', request),
  generateAIStream: (request: AIRequest, onToken: (token: string) => void) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const listener = (_event: Electron.IpcRendererEvent, data: { requestId: string; token: string }) => {
      if (data.requestId === requestId) {
        onToken(data.token);
      }
    };

    ipcRenderer.on('ai:stream-token', listener);
    return ipcRenderer
      .invoke('ai:generate-stream', { request, requestId })
      .finally(() => ipcRenderer.removeListener('ai:stream-token', listener));
  },
  estimateLanguage: (text: string) => ipcRenderer.invoke('ai:estimate', text),

  // 設定管理
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', settings),
  setAPIKey: (apiKey: string) => ipcRenderer.invoke('settings:set-api-key', apiKey),
  hasAPIKey: () => ipcRenderer.invoke('settings:has-api-key'),
  deleteAPIKey: () => ipcRenderer.invoke('settings:delete-api-key'),

  // クリップボード操作
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text: string) => ipcRenderer.invoke('clipboard:write', text),

  // 通知関連
  showNotification: (notification: Notification) =>
    ipcRenderer.invoke('notification:show', notification),

  // イベントリスナー
  onCCTriggered: (callback: (event: ClipboardEvent) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('clipboard:cc-triggered', handler);
    return () => { ipcRenderer.removeListener('clipboard:cc-triggered', handler); };
  },
  notifyRendererReady: () => ipcRenderer.send('renderer:ready'),

  onNotificationReceived: (callback: (notification: Notification) => void) => {
    ipcRenderer.on('notification:received', (event, notification) => callback(notification));
  },

  // ウィンドウ制御
  toggleWindow: () => ipcRenderer.invoke('window:toggle'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // ローカルAI
  getLocalModels: () => ipcRenderer.invoke('local-ai:get-models'),
  checkLocalAIConnection: () => ipcRenderer.invoke('local-ai:check-connection'),
  getLocalAIEndpoint: () => ipcRenderer.invoke('local-ai:get-endpoint'),
  getLocalAIStatus: () => ipcRenderer.invoke('local-ai:get-status'),
  onLocalAIStatusChanged: (callback: (status: LocalAIStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: LocalAIStatus) => callback(status);
    ipcRenderer.on('local-ai:status-changed', handler);
    return () => ipcRenderer.removeListener('local-ai:status-changed', handler);
  },
  startServer: () => ipcRenderer.invoke('local-ai:start-server'),
  checkModel: () => ipcRenderer.invoke('local-ai:check-model'),
  getRecommendedModels: () => ipcRenderer.invoke('local-ai:get-recommended-models'),
  reinitializeAI: () => ipcRenderer.invoke('ai:reinitialize'),
  downloadModel: (modelId: string) => ipcRenderer.invoke('local-ai:download-model', modelId),
  onDownloadProgress: (callback: (data: { model: string; message: string; downloaded?: number; total?: number }) => void) => {
    ipcRenderer.on('local-ai:download-progress', (event, data) => callback(data));
  },

  // アクセシビリティ権限
  checkAccessibility: () => ipcRenderer.invoke('permissions:check-accessibility'),
  requestAccessibility: () => ipcRenderer.invoke('permissions:request-accessibility'),
  reapplyTriggers: () => ipcRenderer.invoke('permissions:reapply-triggers'),
  onAccessibilityStatus: (callback: (status: { granted: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: { granted: boolean }) => callback(status);
    ipcRenderer.on('permissions:accessibility-status', handler);
    return () => ipcRenderer.removeListener('permissions:accessibility-status', handler);
  },

  // セットアップ
  isSetupCompleted: () => ipcRenderer.invoke('setup:is-completed'),
  setSetupCompleted: () => ipcRenderer.invoke('setup:set-completed'),

  // ショートカット
  getCurrentShortcut: () => ipcRenderer.invoke('shortcut:get-current'),
  setShortcut: (shortcut: string) => ipcRenderer.invoke('shortcut:set', shortcut),
  getShortcutPresets: () => ipcRenderer.invoke('shortcut:get-presets'),
});

// 型定義をグローバルに公開
declare global {
  interface Window {
    electronAPI: {
      generateAI: (request: AIRequest) => Promise<AIResponse | { error: string }>;
      generateAIStream: (
        request: AIRequest,
        onToken: (token: string) => void
      ) => Promise<AIResponse | { error: string }>;
      estimateLanguage: (text: string) => Promise<any>;
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: Partial<AppSettings>) => Promise<{ success: boolean; error?: string }>;
      setAPIKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
      hasAPIKey: () => Promise<{ success: boolean; hasAPIKey: boolean; error?: string }>;
      deleteAPIKey: () => Promise<{ success: boolean; error?: string }>;
      readClipboard: () => Promise<string>;
      writeClipboard: (text: string) => Promise<void>;
      showNotification: (notification: Notification) => Promise<void>;
      onCCTriggered: (callback: (event: ClipboardEvent) => void) => (() => void);
      notifyRendererReady: () => void;
      onNotificationReceived: (callback: (notification: Notification) => void) => void;
      toggleWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      getLocalModels: () => Promise<{ success: boolean; models: string[]; error?: string }>;
      checkLocalAIConnection: () => Promise<{ success: boolean; connected: boolean; error?: string }>;
      getLocalAIEndpoint: () => Promise<{ success: boolean; endpoint: string; port: number; running: boolean; error?: string }>;
      getLocalAIStatus: () => Promise<LocalAIStatus>;
      onLocalAIStatusChanged: (callback: (status: LocalAIStatus) => void) => (() => void);
      startServer: () => Promise<{ success: boolean; message: string }>;
      checkModel: () => Promise<{ success: boolean; hasModel: boolean; models?: string[] }>;
      getRecommendedModels: () => Promise<Array<{ name: string; description: string; size: string }>>;
      reinitializeAI: () => Promise<{ success: boolean; error?: string }>;
      downloadModel: (modelId: string) => Promise<{ success: boolean; error?: string }>;
      onDownloadProgress: (callback: (data: { model: string; message: string; downloaded?: number; total?: number }) => void) => void;
      checkAccessibility: () => Promise<boolean>;
      requestAccessibility: () => Promise<boolean>;
      reapplyTriggers: () => Promise<boolean>;
      onAccessibilityStatus: (callback: (status: { granted: boolean }) => void) => (() => void);
      isSetupCompleted: () => Promise<boolean>;
      setSetupCompleted: () => Promise<{ success: boolean }>;
      getCurrentShortcut: () => Promise<string>;
      setShortcut: (shortcut: string) => Promise<{ success: boolean; shortcut?: string; error?: string }>;
      getShortcutPresets: () => Promise<Array<{ key: string; label: string }>>;
    };
  }
}
