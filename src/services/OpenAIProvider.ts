import axios, { AxiosInstance } from 'axios';
import { AIProvider, MODE_TEMPLATES, detectLanguage, determineOutputLanguage } from './AIProvider';
import { AIRequest, AIResponse, Language, AIMode } from '../types';

/**
 * OpenAI互換APIプロバイダー
 */
export class OpenAIProvider extends AIProvider {
  private client: AxiosInstance;
  private apiKey?: string;
  private model: string;
  private maxTokens: number;
  private endpoint: string;

  constructor(apiKey?: string, model: string = 'gpt-4o-mini', endpoint?: string, maxTokens: number = 2000) {
    super();
    this.apiKey = apiKey?.trim();
    this.model = model;
    this.maxTokens = maxTokens;
    this.endpoint = this.normalizeEndpoint(endpoint || 'https://api.openai.com/v1');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const isLocalEndpoint = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(this.endpoint);
    this.client = axios.create({
      baseURL: this.endpoint,
      headers,
      timeout: isLocalEndpoint ? 120000 : 30000,
    });
  }

  /**
   * AIに送信してレスポンスを取得
   */
  async generate(request: AIRequest): Promise<AIResponse> {
    try {
      // 入力言語を推定
      const detectedLanguage = detectLanguage(request.inputText);
      const inputLanguage = request.inputLanguage === Language.AUTO ? detectedLanguage : request.inputLanguage;

      // 出力言語を決定
      const outputLanguage = determineOutputLanguage(inputLanguage, request.outputLanguage);

      // モードテンプレートを取得
      const template = MODE_TEMPLATES[request.mode];
      if (!template) {
        throw new Error(`Unknown mode: ${request.mode}`);
      }

      // プロンプトを構築
      const userPrompt = template.userPromptTemplate
        .replace('{inputLanguage}', this.getLanguageName(inputLanguage))
        .replace('{outputLanguage}', this.getLanguageName(outputLanguage))
        .replace('{inputText}', request.inputText);

      // APIリクエストを送信
      const dynamicMax = Math.min(2000, Math.max(256, request.inputText.length * 3 + 64));
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: template.systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        max_tokens: dynamicMax,
        temperature: 0.3, // 翻訳・校正は低温度で安定性重視
      });

      const outputText = response.data.choices[0].message.content.trim();
      const tokensUsed = response.data.usage?.total_tokens || 0;

      return {
        outputText,
        mode: request.mode,
        inputLanguage,
        outputLanguage,
        timestamp: Date.now(),
        tokensUsed,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          throw new Error('APIキーが無効です。設定を確認してください。');
        } else if (error.response?.status === 404) {
          const rawMessage = (error.response.data as any)?.error?.message;
          const detail = rawMessage ? ` (${rawMessage})` : '';
          throw new Error(
            `APIエンドポイントまたはモデル名が無効です。モデル例: gpt-4o-mini${detail}`
          );
        } else if (error.response?.status === 429) {
          throw new Error('レート制限に達しました。しばらく待ってから再試行してください。');
        } else if (error.response?.status && error.response.status >= 500) {
          throw new Error('AIプロバイダーに一時的な問題が発生しています。再試行してください。');
        } else if (error.code === 'ECONNABORTED') {
          throw new Error('リクエストがタイムアウトしました。ネットワークを確認してください。');
        }
      }
      throw error;
    }
  }

  async generateStream(request: AIRequest, onToken: (token: string) => void): Promise<AIResponse> {
    try {
      const detectedLanguage = detectLanguage(request.inputText);
      const inputLanguage = request.inputLanguage === Language.AUTO
        ? detectedLanguage
        : request.inputLanguage;
      const outputLanguage = determineOutputLanguage(inputLanguage, request.outputLanguage);

      const template = MODE_TEMPLATES[request.mode];
      if (!template) {
        throw new Error(`Unknown mode: ${request.mode}`);
      }

      const userPrompt = template.userPromptTemplate
        .replace('{inputLanguage}', this.getLanguageName(inputLanguage))
        .replace('{outputLanguage}', this.getLanguageName(outputLanguage))
        .replace('{inputText}', request.inputText);
      const dynamicMax = Math.min(2000, Math.max(256, request.inputText.length * 3 + 64));
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          { role: 'system', content: template.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: dynamicMax,
        temperature: 0.3,
        stream: true,
      }, {
        responseType: 'stream',
      });

      let outputText = '';
      let lineBuffer = '';
      let isDone = false;

      for await (const chunk of response.data as AsyncIterable<Buffer | string>) {
        lineBuffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data:')) {
            continue;
          }

          const data = line.slice(5).trimStart();
          if (data === '[DONE]') {
            isDone = true;
            break;
          }
          if (!data) {
            continue;
          }

          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            outputText += token;
            onToken(token);
          }
        }

        if (isDone) {
          break;
        }
      }

      if (!isDone && lineBuffer.startsWith('data:')) {
        const data = lineBuffer.slice(5).trimStart();
        if (data && data !== '[DONE]') {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            outputText += token;
            onToken(token);
          }
        }
      }

      return {
        outputText,
        mode: request.mode,
        inputLanguage,
        outputLanguage,
        timestamp: Date.now(),
        tokensUsed: 0,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          throw new Error('APIキーが無効です。設定を確認してください。');
        }
        if (error.response?.status === 404) {
          const rawMessage = (error.response.data as any)?.error?.message;
          const detail = rawMessage ? ` (${rawMessage})` : '';
          throw new Error(
            `APIエンドポイントまたはモデル名が無効です。モデル例: gpt-4o-mini${detail}`
          );
        }
        if (error.response?.status === 429) {
          throw new Error('レート制限に達しました。しばらく待ってから再試行してください。');
        }
        if (error.response?.status && error.response.status >= 500) {
          throw new Error('AIプロバイダーに一時的な問題が発生しています。再試行してください。');
        }
        if (error.code === 'ECONNABORTED') {
          throw new Error('リクエストがタイムアウトしました。ネットワークを確認してください。');
        }
      }
      throw error;
    }
  }

  /**
   * 言語を推定し、推奨モードを返す
   */
  async estimate(inputText: string): Promise<{ language: Language; suggestedMode: AIMode }> {
    const language = detectLanguage(inputText);
    // Phase 1では翻訳をデフォルトとする
    return {
      language,
      suggestedMode: AIMode.TRANSLATE,
    };
  }

  /**
   * ヘルスチェック
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/models');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 言語コードを言語名に変換
   */
  private getLanguageName(language: Language): string {
    const names: Record<Language, string> = {
      [Language.AUTO]: 'Auto',
      [Language.JAPANESE]: 'Japanese',
      [Language.ENGLISH]: 'English',
    };
    return names[language] || 'Unknown';
  }

  private normalizeEndpoint(endpoint: string): string {
    let normalized = endpoint.trim();
    normalized = normalized.replace(/\/chat\/completions\/?$/i, '');
    normalized = normalized.replace(/\/v1\/chat\/completions\/?$/i, '/v1');
    normalized = normalized.replace(/\/+$/g, '');
    return normalized;
  }
}
