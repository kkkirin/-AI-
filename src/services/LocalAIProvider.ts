import axios, { AxiosInstance } from 'axios';
import { AIProvider, detectLanguage, determineOutputLanguage } from './AIProvider';
import { AIRequest, AIResponse, Language, AIMode } from '../types';

/**
 * モードごとのプロンプトと生成パラメータ
 */
interface ModeTemplate {
  systemPrompt: string;
  userPromptTemplate: string;
  temperature?: number;
  frequency_penalty?: number;
}

const MODE_TEMPLATES: Record<AIMode, ModeTemplate> = {
  [AIMode.TRANSLATE]: {
    systemPrompt: `You are a translator. Output only the translated text. No explanations.`,
    userPromptTemplate: 'Translate to {outputLanguage}: {inputText}',
  },

  [AIMode.POLITE]: {
    systemPrompt: `You convert casual Japanese text into polite business Japanese (敬語). Output only the converted text. No explanations.`,
    userPromptTemplate: 'Convert to polite business Japanese: {inputText}',
  },

  [AIMode.REPHRASE]: {
    systemPrompt: `You translate keigo (敬語) into casual speech (タメ口). Apply these rules: ございます→ありがとう, です→だよ, ます→るよ, でしょうか→かな, いただけますか→もらえる？, ください→して. Do not add new sentences. Output only the result.`,
    userPromptTemplate: 'Translate from keigo to tameguchi: {inputText}',
    temperature: 0.7,
    frequency_penalty: 1.0,
  },

  [AIMode.SUMMARIZE]: {
    systemPrompt: `You summarize text into 3 bullet points in the same language as the input. Output only the bullet points. No explanations.`,
    userPromptTemplate: 'Summarize in 3 bullet points: {inputText}',
  },

  [AIMode.PROOFREADING]: {
    systemPrompt: `You fix typos, grammar errors, and improve readability. Keep the original meaning and tone. Output only the corrected text. No explanations.`,
    userPromptTemplate: 'Fix errors in this text: {inputText}',
  },

};

/**
 * ローカルAIプロバイダー（llama-server OpenAI互換API）
 */
export class LocalAIProvider extends AIProvider {
  private client: AxiosInstance;
  private endpoint: string;

  constructor(endpoint: string = 'http://127.0.0.1:8080/v1') {
    super();
    this.endpoint = endpoint;

    this.client = axios.create({
      baseURL: this.endpoint,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    });
  }

  /**
   * AIに送信してレスポンスを取得（OpenAI互換 chat/completions）
   */
  async generate(request: AIRequest): Promise<AIResponse> {
    try {
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

      const messages = [
        { role: 'system', content: template.systemPrompt },
        { role: 'user', content: userPrompt },
      ];
      const dynamicMax = Math.min(2000, Math.max(256, request.inputText.length * 3 + 64));

      const requestBody: any = {
        messages,
        temperature: template.temperature ?? 0.3,
        max_tokens: dynamicMax,
        stream: false,
      };
      if (template.frequency_penalty) {
        requestBody.frequency_penalty = template.frequency_penalty;
      }

      const response = await this.client.post('/chat/completions', requestBody);

      const outputText = response.data.choices?.[0]?.message?.content?.trim() || '';
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
        if (error.code === 'ECONNREFUSED') {
          throw new Error('AI推論エンジンに接続できません。再起動してください。');
        } else if (error.code === 'ECONNABORTED') {
          throw new Error('リクエストがタイムアウトしました。モデルの処理に時間がかかっています。');
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

      const messages = [
        { role: 'system', content: template.systemPrompt },
        { role: 'user', content: userPrompt },
      ];
      const dynamicMax = Math.min(2000, Math.max(256, request.inputText.length * 3 + 64));
      const requestBody: any = {
        messages,
        temperature: template.temperature ?? 0.3,
        max_tokens: dynamicMax,
        stream: true,
      };
      if (template.frequency_penalty) {
        requestBody.frequency_penalty = template.frequency_penalty;
      }

      const response = await this.client.post('/chat/completions', requestBody, {
        responseType: 'stream',
        timeout: 120000,
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
        if (error.code === 'ECONNREFUSED') {
          throw new Error('AI推論エンジンに接続できません。再起動してください。');
        } else if (error.code === 'ECONNABORTED') {
          throw new Error('リクエストがタイムアウトしました。モデルの処理に時間がかかっています。');
        }
      }
      throw error;
    }
  }

  async warmup(): Promise<void> {
    await this.client.post('/chat/completions', {
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
      stream: false,
      temperature: 0,
    });
  }

  /**
   * 言語を推定し、推奨モードを返す
   */
  async estimate(inputText: string): Promise<{ language: Language; suggestedMode: AIMode }> {
    const language = detectLanguage(inputText);
    return {
      language,
      suggestedMode: AIMode.TRANSLATE,
    };
  }

  /**
   * ヘルスチェック（/health エンドポイント）
   */
  async healthCheck(): Promise<boolean> {
    try {
      // llama-server の /health は baseURL の親パスにある
      const baseUrl = this.endpoint.replace(/\/v1\/?$/, '');
      const res = await axios.get(`${baseUrl}/health`, { timeout: 3000 });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * 言語コードを言語名に変換（日本語）
   */
  private getLanguageName(language: Language): string {
    const names: Record<Language, string> = {
      [Language.AUTO]: 'auto',
      [Language.JAPANESE]: 'Japanese',
      [Language.ENGLISH]: 'English',
    };
    return names[language] || 'unknown';
  }
}
