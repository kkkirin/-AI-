/**
 * AIモードの定義
 */
export enum AIMode {
  TRANSLATE = 'translate',
  POLITE = 'polite',
  REPHRASE = 'rephrase',
  SUMMARIZE = 'summarize',
  PROOFREADING = 'proofreading',
}

/**
 * 言語の定義
 */
export enum Language {
  AUTO = 'auto',
  JAPANESE = 'ja',
  ENGLISH = 'en',
}

/**
 * AIプロバイダーの種類
 */
export enum ProviderType {
  API = 'api',
  LOCAL = 'local',
  CLI = 'cli',
}

/**
 * APIリクエスト構造
 */
export interface AIRequest {
  inputText: string;
  mode: AIMode;
  inputLanguage: Language;
  outputLanguage: Language;
  settings?: Record<string, any>;
}

/**
 * APIレスポンス構造
 */
export interface AIResponse {
  outputText: string;
  mode: AIMode;
  inputLanguage: Language;
  outputLanguage: Language;
  timestamp: number;
  tokensUsed?: number;
}

/**
 * 履歴エントリ
 */
export interface HistoryEntry {
  id: string;
  inputText: string;
  outputText: string;
  mode: AIMode;
  inputLanguage: Language;
  outputLanguage: Language;
  timestamp: number;
  appName?: string;
  encrypted: boolean;
}

/**
 * 用語集エントリ
 */
export interface GlossaryEntry {
  id: string;
  sourceTerm: string;
  targetTerm: string;
  mode: AIMode;
  language?: Language;
}

/**
 * アプリケーション設定
 */
export interface AppSettings {
  // ショートカット設定
  shortcut: {
    triggerType: 'hotkey' | 'double_copy';
    alternateHotkey?: string;
  };

  // AI実行方式
  provider: {
    type: ProviderType;
    model: string;
    localServerPort?: number;
  };

  // 出力ルール
  output: {
    autoClipboard: boolean;
    autoPaste: boolean;
    formatType: 'text_only' | 'with_supplement' | 'two_pane';
  };

  // プライバシー設定
  privacy: {
    enableHistory: boolean;
    encryptHistory: boolean;
    excludedApps: string[];
    excludePatterns: string[]; // 正規表現
  };

  // 言語設定
  language: {
    autoDetect: boolean;
    defaultInputLanguage: Language;
    defaultOutputLanguage: Language;
  };

  // UI設定
  ui: {
    autoStart: boolean;
    theme: 'light' | 'dark';
    fontSize: number;
    fontFamily: string;
    closeAction: 'minimize_to_tray' | 'confirm' | 'quit';
  };
}

/**
 * クリップボード監視イベント
 */
export interface ClipboardEvent {
  text: string;
  timestamp: number;
  count: number; // コピー回数
  mode?: AIMode; // オプション: AIモード
}

/**
 * ホットキーイベント
 */
export interface HotkeyEvent {
  type: 'double_copy' | 'hotkey';
  timestamp: number;
}
