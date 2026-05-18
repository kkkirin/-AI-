import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockUserDataPath = path.join(os.tmpdir(), `quicktext-settings-test-${Date.now()}`);

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => mockUserDataPath),
  },
}));

jest.mock('keytar', () => ({
  setPassword: jest.fn(),
  getPassword: jest.fn(),
  deletePassword: jest.fn(),
}));

import { SettingsManager } from '../SettingsManager';

describe('SettingsManager privacy exclude patterns', () => {
  beforeEach(() => {
    fs.rmSync(mockUserDataPath, { recursive: true, force: true });
    fs.mkdirSync(mockUserDataPath, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(mockUserDataPath, { recursive: true, force: true });
  });

  it('migrates broad legacy defaults and avoids blocking plain documentation text', () => {
    fs.writeFileSync(
      path.join(mockUserDataPath, 'settings.json'),
      JSON.stringify({
        privacy: {
          excludePatterns: ['password=', 'api_key', '-----BEGIN'],
        },
      }),
      'utf-8'
    );

    const manager = new SettingsManager();
    const patterns = manager.getSettings().privacy.excludePatterns;

    expect(patterns).not.toContain('password=');
    expect(patterns).not.toContain('api_key');
    expect(patterns).not.toContain('-----BEGIN');
    expect(manager.getTextExclusionMatch('This document mentions api_key as a field name.')).toBeNull();
  });

  it('still blocks likely secret assignments and private key headers', () => {
    const manager = new SettingsManager();

    expect(manager.getTextExclusionMatch('OPENAI_API_KEY=sk-test')).not.toBeNull();
    expect(manager.getTextExclusionMatch('password=hunter2')).not.toBeNull();
    expect(manager.getTextExclusionMatch('-----BEGIN PRIVATE KEY-----')).not.toBeNull();
  });

  it('does not persist API keys into settings.json', async () => {
    const manager = new SettingsManager();

    await manager.saveSettings({
      provider: {
        apiKey: 'sk-test',
      } as any,
    });

    const rawSettings = JSON.parse(
      fs.readFileSync(path.join(mockUserDataPath, 'settings.json'), 'utf-8')
    );
    expect(rawSettings.provider.apiKey).toBeUndefined();
  });
});
