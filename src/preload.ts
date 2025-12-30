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
  deleteAPIKey: () => ipcRenderer.invoke('settings:delete-api-key'),

  // クリップボード操作
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text: string) => ipcRenderer.invoke('clipboard:write', text),
  startClipboardMonitor: (threshold: number) => ipcRenderer.send('clipboard:start-monitor', threshold),
  stopClipboardMonitor: () => ipcRenderer.send('clipboard:stop-monitor'),

  // 通知関連
  showNotification: (notification: Notification) =>
    ipcRenderer.invoke('notification:show', notification),

  // イベントリスナー
  onCCTriggered: (callback: (event: ClipboardEvent) => void) => {
    ipcRenderer.on('clipboard:cc-triggered', (event, data) => callback(data));
  },

  onTripleCopyTriggered: (callback: (event: ClipboardEvent) => void) => {
    ipcRenderer.on('clipboard:triple-copy-triggered', (event, data) => callback(data));
  },

  onNotificationReceived: (callback: (notification: Notification) => void) => {
    ipcRenderer.on('notification:received', (event, notification) => callback(notification));
  },

  // ウィンドウ制御
  toggleWindow: () => ipcRenderer.invoke('window:toggle'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
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
      deleteAPIKey: () => Promise<{ success: boolean; error?: string }>;
      readClipboard: () => Promise<string>;
      writeClipboard: (text: string) => Promise<void>;
      startClipboardMonitor: (threshold: number) => void;
      stopClipboardMonitor: () => void;
      showNotification: (notification: Notification) => Promise<void>;
      onCCTriggered: (callback: (event: ClipboardEvent) => void) => void;
      onTripleCopyTriggered: (callback: (event: ClipboardEvent) => void) => void;
      onNotificationReceived: (callback: (notification: Notification) => void) => void;
      toggleWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
    };
  }
}
