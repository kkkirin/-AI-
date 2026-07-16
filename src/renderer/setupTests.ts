import '@testing-library/jest-dom';
import { AppSettings, ProviderType, Language } from '../types';

const mockSettings: AppSettings = {
  shortcut: {
    triggerType: 'hotkey',
    alternateHotkey: 'Command+Shift+V',
  },
  provider: {
    type: ProviderType.LOCAL,
    apiProvider: 'openai',
    apiKey: undefined,
    apiEndpoint: undefined,
    localServerPort: 8080,
    model: 'LFM2.5-1.2B-JP-Q4_K_M',
    maxTokensPerRequest: 2000,
    dailyTokenLimit: 100000,
  },
  output: {
    autoClipboard: false,
    autoPaste: false,
    formatType: 'text_only',
    preserveLineBreaks: true,
  },
  privacy: {
    enableHistory: false,
    encryptHistory: true,
    excludedApps: [],
    excludePatterns: [
      '\\b[A-Z0-9_]*(?:PASSWORD|PASSWD|PWD)\\b\\s*[:=]\\s*[^\\s,;]+',
      '\\b[A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|SECRET[_-]?KEY|CLIENT[_-]?SECRET)\\b\\s*[:=]\\s*[^\\s,;]+',
      '-----BEGIN [A-Z ]*PRIVATE KEY-----',
    ],
  },
  language: {
    autoDetect: true,
    defaultInputLanguage: Language.AUTO,
    defaultOutputLanguage: Language.AUTO,
  },
  ui: {
    autoStart: false,
    theme: 'light',
    fontSize: 14,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    closeAction: 'minimize_to_tray',
  },
};

const electronAPI = {
  generateAI: jest.fn(),
  generateAIStream: jest.fn(),
  estimateLanguage: jest.fn(),
  getSettings: jest.fn().mockResolvedValue(mockSettings),
  saveSettings: jest.fn().mockResolvedValue({ success: true }),
  setAPIKey: jest.fn().mockResolvedValue({ success: true }),
  hasAPIKey: jest.fn().mockResolvedValue({ success: true, hasAPIKey: false }),
  deleteAPIKey: jest.fn().mockResolvedValue({ success: true }),
  readClipboard: jest.fn().mockResolvedValue(''),
  writeClipboard: jest.fn().mockResolvedValue(undefined),
  showNotification: jest.fn().mockResolvedValue(undefined),
  onCCTriggered: jest.fn(),
  notifyRendererReady: jest.fn(),
  onNotificationReceived: jest.fn(),
  toggleWindow: jest.fn().mockResolvedValue(undefined),
  closeWindow: jest.fn().mockResolvedValue(undefined),
  getLocalModels: jest.fn().mockResolvedValue({ success: true, models: [] }),
  checkLocalAIConnection: jest.fn().mockResolvedValue({ success: true, connected: false }),
  getLocalAIEndpoint: jest.fn().mockResolvedValue({ success: true, endpoint: 'http://127.0.0.1:8080/v1', port: 8080, running: false }),
  startServer: jest.fn().mockResolvedValue({ success: true, message: '' }),
  checkModel: jest.fn().mockResolvedValue({ success: true, hasModel: false, models: [] }),
  checkAccessibility: jest.fn().mockResolvedValue(true),
  requestAccessibility: jest.fn().mockResolvedValue(true),
  reapplyTriggers: jest.fn().mockResolvedValue(true),
  onAccessibilityStatus: jest.fn(() => jest.fn()),
  getRecommendedModels: jest.fn().mockResolvedValue([]),
  reinitializeAI: jest.fn().mockResolvedValue({ success: true }),
  downloadModel: jest.fn().mockResolvedValue({ success: true }),
  onDownloadProgress: jest.fn(),
  isSetupCompleted: jest.fn().mockResolvedValue(false),
  setSetupCompleted: jest.fn().mockResolvedValue({ success: true }),
  getCurrentShortcut: jest.fn().mockResolvedValue('Command+Shift+V'),
  setShortcut: jest.fn().mockResolvedValue({ success: true, shortcut: 'Command+Shift+V' }),
  getShortcutPresets: jest.fn().mockResolvedValue([]),
};

Object.defineProperty(window, 'electronAPI', {
  value: electronAPI,
  writable: true,
});
