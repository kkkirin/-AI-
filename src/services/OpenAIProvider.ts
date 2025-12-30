import axios, { AxiosInstance } from 'axios';
import { AIProvider, MODE_TEMPLATES, detectLanguage, determineOutputLanguage } from './AIProvider';
import { AIRequest, AIResponse, Language, AIMode } from '../types';

/**
 * OpenAI互換APIプロバイダー
 */
export class OpenAIProvider extends AIProvider {
  private client: AxiosInstance;
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private endpoint: string;

  constructor(apiKey: string, model: string = 'gpt-4-mini', endpoint?: string, maxTokens: number = 2000) {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = maxTokens;
    this.endpoint = endpoint || 'https://api.openai.com/v1';

    this.client = axios.create({
      baseURL: this.endpoint,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
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
        max_tokens: this.maxTokens,
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
}
