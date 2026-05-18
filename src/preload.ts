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

/**
 * Preload スクリプト
 * レンダラープロセスに安全なAPI を公開
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // AI生成
  generateAI: (request: AIRequest) => ipcRenderer.invoke('ai:generate', request),
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
  startServer: () => ipcRenderer.invoke('local-ai:start-server'),
  checkModel: () => ipcRenderer.invoke('local-ai:check-model'),
  getRecommendedModels: () => ipcRenderer.invoke('local-ai:get-recommended-models'),
  reinitializeAI: () => ipcRenderer.invoke('ai:reinitialize'),
  downloadModel: (modelId: string) => ipcRenderer.invoke('local-ai:download-model', modelId),
  onDownloadProgress: (callback: (data: { model: string; message: string; downloaded?: number; total?: number }) => void) => {
    ipcRenderer.on('local-ai:download-progress', (event, data) => callback(data));
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
      onNotificationReceived: (callback: (notification: Notification) => void) => void;
      toggleWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      getLocalModels: () => Promise<{ success: boolean; models: string[]; error?: string }>;
      checkLocalAIConnection: () => Promise<{ success: boolean; connected: boolean; error?: string }>;
      getLocalAIEndpoint: () => Promise<{ success: boolean; endpoint: string; port: number; running: boolean; error?: string }>;
      startServer: () => Promise<{ success: boolean; message: string }>;
      checkModel: () => Promise<{ success: boolean; hasModel: boolean; models?: string[] }>;
      getRecommendedModels: () => Promise<Array<{ name: string; description: string; size: string }>>;
      reinitializeAI: () => Promise<{ success: boolean; error?: string }>;
      downloadModel: (modelId: string) => Promise<{ success: boolean; error?: string }>;
      onDownloadProgress: (callback: (data: { model: string; message: string; downloaded?: number; total?: number }) => void) => void;
      isSetupCompleted: () => Promise<boolean>;
      setSetupCompleted: () => Promise<{ success: boolean }>;
      getCurrentShortcut: () => Promise<string>;
      setShortcut: (shortcut: string) => Promise<{ success: boolean; shortcut?: string; error?: string }>;
      getShortcutPresets: () => Promise<Array<{ key: string; label: string }>>;
    };
  }
}
