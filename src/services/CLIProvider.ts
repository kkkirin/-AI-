import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AIProvider, MODE_TEMPLATES, detectLanguage, determineOutputLanguage } from './AIProvider';
import { AIRequest, AIResponse, AIMode, CLIProviderType, Language } from '../types';

interface CLIProviderOptions {
  provider: CLIProviderType;
  command?: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

export class CLIProvider extends AIProvider {
  private provider: CLIProviderType;
  private command?: string;
  private model?: string;
  private maxTokens: number;
  private timeoutMs: number;

  constructor(options: CLIProviderOptions) {
    super();
    this.provider = options.provider;
    this.command = options.command?.trim() || undefined;
    this.model = this.normalizeModel(options.model);
    this.maxTokens = options.maxTokens || 2000;
    this.timeoutMs = options.timeoutMs || 180000;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const detectedLanguage = detectLanguage(request.inputText);
    const inputLanguage = request.inputLanguage === Language.AUTO ? detectedLanguage : request.inputLanguage;
    const outputLanguage = determineOutputLanguage(inputLanguage, request.outputLanguage);
    const template = MODE_TEMPLATES[request.mode];
    if (!template) {
      throw new Error(`Unknown mode: ${request.mode}`);
    }

    const userPrompt = template.userPromptTemplate
      .replace('{inputLanguage}', this.getLanguageName(inputLanguage))
      .replace('{outputLanguage}', this.getLanguageName(outputLanguage))
      .replace('{inputText}', request.inputText);

    const prompt = [
      template.systemPrompt,
      '',
      'You are running as a non-interactive text transformation backend for QuickText.',
      'Return only the final transformed text. Do not explain your reasoning.',
      '',
      userPrompt,
    ].join('\n');

    const outputText =
      this.provider === 'codex'
        ? await this.runCodex(prompt)
        : await this.runClaude(prompt);

    return {
      outputText: outputText.trim(),
      mode: request.mode,
      inputLanguage,
      outputLanguage,
      timestamp: Date.now(),
      tokensUsed: 0,
    };
  }

  async estimate(inputText: string): Promise<{ language: Language; suggestedMode: AIMode }> {
    return {
      language: detectLanguage(inputText),
      suggestedMode: AIMode.TRANSLATE,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const command = this.resolveCommand();
      const result = await this.runCommand(command, ['--version'], undefined, 10000);
      return result.stdout.trim().length > 0 || result.stderr.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async runCodex(prompt: string): Promise<string> {
    const command = this.resolveCommand();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quicktext-codex-'));
    const outputPath = path.join(tempDir, 'last-message.txt');
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--ephemeral',
      '--ignore-rules',
      '--sandbox',
      'read-only',
      '--ask-for-approval',
      'never',
      '--color',
      'never',
      '--cd',
      os.tmpdir(),
      '-o',
      outputPath,
    ];

    if (this.model) {
      args.push('-m', this.model);
    }

    args.push('-');

    try {
      const result = await this.runCommand(command, args, prompt, this.timeoutMs);
      if (fs.existsSync(outputPath)) {
        const finalMessage = fs.readFileSync(outputPath, 'utf-8').trim();
        if (finalMessage) {
          return finalMessage;
        }
      }
      return result.stdout.trim();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private async runClaude(prompt: string): Promise<string> {
    const command = this.resolveCommand();
    const args = [
      '--print',
      '--output-format',
      'text',
      '--permission-mode',
      'dontAsk',
      '--no-session-persistence',
      '--tools',
      '',
    ];

    if (this.model) {
      args.push('--model', this.model);
    }

    args.push(prompt);
    const result = await this.runCommand(command, args, undefined, this.timeoutMs);
    return result.stdout.trim();
  }

  private runCommand(
    command: string,
    args: string[],
    stdin?: string,
    timeoutMs: number = this.timeoutMs
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: os.tmpdir(),
        env: this.getCommandEnv(),
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        reject(new Error(`${this.getProviderLabel()} の実行がタイムアウトしました。`));
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`${this.getProviderLabel()} を起動できません: ${error.message}`));
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        const detail = (stderr || stdout).trim();
        reject(new Error(`${this.getProviderLabel()} の実行に失敗しました${detail ? `: ${detail}` : ''}`));
      });

      if (stdin !== undefined) {
        child.stdin?.write(stdin);
      }
      child.stdin?.end();
    });
  }

  private resolveCommand(): string {
    if (this.command) {
      return this.expandHome(this.command);
    }

    const commandName = this.provider === 'codex' ? 'codex' : 'claude';
    const candidates = this.getCommandCandidates(commandName);
    for (const candidate of candidates) {
      if (this.isExecutable(candidate)) {
        return candidate;
      }
    }
    return commandName;
  }

  private getCommandCandidates(commandName: string): string[] {
    const executableName = process.platform === 'win32' ? `${commandName}.cmd` : commandName;
    const candidates = [
      executableName,
      ...this.getPathCandidates(executableName),
      path.join(os.homedir(), '.asdf', 'shims', executableName),
      path.join(os.homedir(), '.local', 'bin', executableName),
      path.join(os.homedir(), '.npm-global', 'bin', executableName),
      '/opt/homebrew/bin/' + executableName,
      '/usr/local/bin/' + executableName,
      '/usr/bin/' + executableName,
    ];

    if (commandName === 'claude') {
      candidates.push(...this.getNvmCandidates(executableName));
    }

    return Array.from(new Set(candidates.map((candidate) => this.expandHome(candidate))));
  }

  private getPathCandidates(executableName: string): string[] {
    return (process.env.PATH || '')
      .split(path.delimiter)
      .filter(Boolean)
      .map((entry) => path.join(entry, executableName));
  }

  private getNvmCandidates(executableName: string): string[] {
    const baseDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
    if (!fs.existsSync(baseDir)) {
      return [];
    }

    try {
      return fs
        .readdirSync(baseDir)
        .sort()
        .reverse()
        .map((version) => path.join(baseDir, version, 'bin', executableName));
    } catch {
      return [];
    }
  }

  private isExecutable(candidate: string): boolean {
    if (candidate === 'codex' || candidate === 'claude' || candidate === 'codex.cmd' || candidate === 'claude.cmd') {
      return false;
    }
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  private getCommandEnv(): NodeJS.ProcessEnv {
    const extraPaths = [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      path.join(os.homedir(), '.asdf', 'shims'),
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), '.npm-global', 'bin'),
    ];

    return {
      ...process.env,
      PATH: Array.from(new Set([...(process.env.PATH || '').split(path.delimiter), ...extraPaths].filter(Boolean))).join(path.delimiter),
    };
  }

  private normalizeModel(model?: string): string | undefined {
    const normalized = model?.trim();
    if (!normalized || normalized.startsWith('LFM2.5-')) {
      return undefined;
    }
    return normalized;
  }

  private expandHome(value: string): string {
    if (value === '~') {
      return os.homedir();
    }
    if (value.startsWith('~/')) {
      return path.join(os.homedir(), value.slice(2));
    }
    return value;
  }

  private getLanguageName(language: Language): string {
    const names: Record<Language, string> = {
      [Language.AUTO]: 'Auto',
      [Language.JAPANESE]: 'Japanese',
      [Language.ENGLISH]: 'English',
    };
    return names[language] || 'Unknown';
  }

  private getProviderLabel(): string {
    return this.provider === 'codex' ? 'Codex CLI' : 'Claude Code';
  }
}
