import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
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
        type: ProviderType.LOCAL,
        model: 'LFM2.5-1.2B-JP-Q4_K_M',
        localServerPort: 8080,
      },
      output: {
        autoClipboard: true,
        autoPaste: false,
        formatType: 'text_only',
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
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
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
    merged.privacy.excludePatterns = this.migrateExcludePatterns(merged.privacy.excludePatterns);
    merged.provider = {
      type: ProviderType.LOCAL,
      model: merged.provider.model,
      localServerPort: this.normalizePort(merged.provider.localServerPort),
    };
    merged.output = {
      autoClipboard: merged.output.autoClipboard,
      autoPaste: merged.output.autoPaste,
      formatType: merged.output.formatType,
    };
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
