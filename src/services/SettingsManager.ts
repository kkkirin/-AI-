import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as keytar from 'keytar';
import { AppSettings, Language, AIMode, ProviderType } from '../types';

const DEFAULT_EXCLUDE_PATTERNS = [
  '\\b[A-Z0-9_]*(?:PASSWORD|PASSWD|PWD)\\b\\s*[:=]\\s*[^\\s,;]+',
  '\\b[A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|SECRET[_-]?KEY|CLIENT[_-]?SECRET)\\b\\s*[:=]\\s*[^\\s,;]+',
  '-----BEGIN [A-Z ]*PRIVATE KEY-----',
];

const LEGACY_EXCLUDE_PATTERN_REPLACEMENTS: Record<string, string[]> = {
  'password=': [DEFAULT_EXCLUDE_PATTERNS[0]],
  api_key: [DEFAULT_EXCLUDE_PATTERNS[1]],
  '-----BEGIN': [DEFAULT_EXCLUDE_PATTERNS[2]],
};

/**
 * 設定管理サービス
 */
export class SettingsManager {
  private settingsPath: string;
  private settings: AppSettings;
  private serviceName = 'quicktext';
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
        return this.normalizeSettings(JSON.parse(data));
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
        triggerType: 'hotkey',
        alternateHotkey: process.platform === 'darwin' ? 'Command+Shift+V' : 'Ctrl+Shift+V',
      },
      provider: {
        type: ProviderType.CLI,
        apiProvider: 'openai',
        cliProvider: 'codex',
        apiKey: undefined,
        apiEndpoint: undefined,
        cliCommand: undefined,
        localServerPort: 8080,
        model: 'gpt-5.5',
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
        excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
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
  }

  /**
   * 設定を保存（ディープマージ）
   */
  async saveSettings(settings: Partial<AppSettings>): Promise<void> {
    this.settings = this.normalizeSettings(this.deepMerge(this.settings, settings));
    try {
      const persistedSettings: AppSettings = {
        ...this.settings,
        provider: {
          ...this.settings.provider,
          apiKey: undefined,
        },
      };
      fs.writeFileSync(this.settingsPath, JSON.stringify(persistedSettings, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving settings:', error);
      throw error;
    }
  }

  /**
   * ディープマージヘルパー
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else if (source[key] !== undefined) {
        result[key] = source[key];
      }
    }
    return result;
  }

  private normalizeSettings(settings: Partial<AppSettings>): AppSettings {
    const merged = this.deepMerge(this.getDefaultSettings(), settings);
    const migrationState = merged as AppSettings & { providerMigration?: string };
    merged.privacy.excludePatterns = this.migrateExcludePatterns(merged.privacy.excludePatterns);
    merged.provider.localServerPort = this.normalizePort(merged.provider.localServerPort);

    if (
      migrationState.providerMigration !== 'codex-gpt55-default-v1' &&
      merged.provider.type === ProviderType.LOCAL &&
      merged.provider.model.startsWith('LFM2.5-')
    ) {
      merged.provider.type = ProviderType.CLI;
      merged.provider.cliProvider = 'codex';
      merged.provider.model = 'gpt-5.5';
      migrationState.providerMigration = 'codex-gpt55-default-v1';
    }

    if (
      merged.provider.type === ProviderType.CLI &&
      (merged.provider.cliProvider || 'codex') === 'codex' &&
      (!merged.provider.model ||
        merged.provider.model.startsWith('LFM2.5-') ||
        merged.provider.model === 'gpt-4o-mini')
    ) {
      merged.provider.model = 'gpt-5.5';
    }
    return merged;
  }

  private normalizePort(port: number | undefined): number {
    const normalized = Number(port);
    if (!Number.isInteger(normalized) || normalized < 1024 || normalized > 65535) {
      return 8080;
    }
    return normalized;
  }

  private migrateExcludePatterns(patterns: string[] | undefined): string[] {
    const migrated: string[] = [];
    const source = Array.isArray(patterns) ? patterns : DEFAULT_EXCLUDE_PATTERNS;

    const addPattern = (pattern: string) => {
      if (pattern && !migrated.includes(pattern)) {
        migrated.push(pattern);
      }
    };

    for (const pattern of source) {
      const trimmedPattern = pattern.trim();
      const replacements = LEGACY_EXCLUDE_PATTERN_REPLACEMENTS[trimmedPattern];
      if (replacements) {
        replacements.forEach(addPattern);
      } else {
        addPattern(trimmedPattern);
      }
    }

    return migrated.length > 0 ? migrated : [...DEFAULT_EXCLUDE_PATTERNS];
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

  async hasAPIKey(): Promise<boolean> {
    const key = await this.getAPIKey();
    return Boolean(key || process.env.OPENAI_API_KEY);
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
    return this.getTextExclusionMatch(text) !== null;
  }

  /**
   * テキストに一致した除外パターンを取得
   */
  getTextExclusionMatch(text: string): { pattern: string; matchedText: string } | null {
    for (const pattern of this.settings.privacy.excludePatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        const match = regex.exec(text);
        if (match) {
          return {
            pattern,
            matchedText: match[0],
          };
        }
      } catch (error) {
        console.error(`Invalid regex pattern: ${pattern}`, error);
      }
    }
    return null;
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
