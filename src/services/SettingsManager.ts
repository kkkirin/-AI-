import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as keytar from 'keytar';
import { AppSettings, Language, AIMode, ProviderType } from '../types';

/**
 * 設定管理サービス
 */
export class SettingsManager {
  private settingsPath: string;
  private settings: AppSettings;
  private serviceName = 'cc-ai';
  private accountName = 'api-key';

  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
    this.settings = this.loadSettings();
  }

  /**
   * 設定を読み込む
   */
  private loadSettings(): AppSettings {
    if (fs.existsSync(this.settingsPath)) {
      try {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        return JSON.parse(data);
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    }

    // デフォルト設定を返す
    return this.getDefaultSettings();
  }

  /**
   * デフォルト設定を取得
   */
  private getDefaultSettings(): AppSettings {
    return {
      shortcut: {
        triggerType: 'double_copy',
        doubleCopyThreshold: 500,
        alternateHotkey: undefined,
      },
      provider: {
        type: ProviderType.API,
        apiProvider: 'openai',
        apiKey: undefined,
        apiEndpoint: 'https://api.openai.com/v1',
        model: 'gpt-4-mini',
        maxTokensPerRequest: 2000,
        dailyTokenLimit: 100000,
      },
      output: {
        autoClipboard: true,
        autoPaste: false,
        formatType: 'text_only',
        preserveLineBreaks: true,
      },
      privacy: {
        enableHistory: false,
        encryptHistory: true,
        excludedApps: [],
        excludePatterns: ['password=', 'api_key', '-----BEGIN'],
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
      },
    };
  }

  /**
   * 設定を保存
   */
  async saveSettings(settings: Partial<AppSettings>): Promise<void> {
    this.settings = { ...this.settings, ...settings };
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving settings:', error);
      throw error;
    }
  }

  /**
   * 現在の設定を取得
   */
  getSettings(): AppSettings {
    return this.settings;
  }

  /**
   * APIキーを安全に保存
   */
  async setAPIKey(apiKey: string): Promise<void> {
    try {
      await keytar.setPassword(this.serviceName, this.accountName, apiKey);
      this.settings.provider.apiKey = apiKey;
    } catch (error) {
      console.error('Error saving API key:', error);
      throw error;
    }
  }

  /**
   * APIキーを取得
   */
  async getAPIKey(): Promise<string | null> {
    try {
      const key = await keytar.getPassword(this.serviceName, this.accountName);
      return key || null;
    } catch (error) {
      console.error('Error retrieving API key:', error);
      return null;
    }
  }

  /**
   * APIキーを削除
   */
  async deleteAPIKey(): Promise<void> {
    try {
      await keytar.deletePassword(this.serviceName, this.accountName);
      this.settings.provider.apiKey = undefined;
    } catch (error) {
      console.error('Error deleting API key:', error);
    }
  }

  /**
   * 特定のアプリが除外リストに含まれているかチェック
   */
  isAppExcluded(appName: string): boolean {
    return this.settings.privacy.excludedApps.includes(appName);
  }

  /**
   * テキストが除外パターンに一致するかチェック
   */
  isTextExcluded(text: string): boolean {
    for (const pattern of this.settings.privacy.excludePatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(text)) {
          return true;
        }
      } catch (error) {
        console.error(`Invalid regex pattern: ${pattern}`, error);
      }
    }
    return false;
  }

  /**
   * 設定をリセット
   */
  async resetSettings(): Promise<void> {
    this.settings = this.getDefaultSettings();
    await this.saveSettings(this.settings);
    await this.deleteAPIKey();
  }
}

// グローバルシングルトン
let settingsManager: SettingsManager | null = null;

export function getSettingsManager(): SettingsManager {
  if (!settingsManager) {
    settingsManager = new SettingsManager();
  }
  return settingsManager;
}
