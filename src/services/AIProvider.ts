import { AIRequest, AIResponse, Language, AIMode } from '../types';

/**
 * AIプロバイダーの抽象インターフェース
 * Phase 1: API実装
 * Phase 2: ローカルプロバイダーに差し替え可能
 */
export abstract class AIProvider {
  abstract generate(request: AIRequest): Promise<AIResponse>;
  abstract estimate(inputText: string): Promise<{ language: Language; suggestedMode: AIMode }>;
  abstract healthCheck(): Promise<boolean>;
}

/**
 * モードテンプレート定義
 */
export const MODE_TEMPLATES: Record<AIMode, { systemPrompt: string; userPromptTemplate: string }> = {
  [AIMode.TRANSLATE]: {
    systemPrompt: `You are a professional translator. Follow these rules strictly:
- Translate the text to the target language
- Do not add any explanations or commentary
- Preserve all formatting, line breaks, and special characters
- Keep proper nouns, numbers, and units unchanged
- Do not add information not present in the original text
- Return only the translated text`,
    userPromptTemplate: 'Translate the following text from {inputLanguage} to {outputLanguage}:\n\n{inputText}',
  },

  [AIMode.POLITE]: {
    systemPrompt: `You are an expert in business communication. Follow these rules strictly:
- Convert casual language to polite business language
- Maintain the original meaning and intent
- Do not add explanations or commentary
- Preserve all formatting and line breaks
- Do not add information not present in the original text
- Return only the converted text`,
    userPromptTemplate: 'Convert the following text to polite business language:\n\n{inputText}',
  },

  [AIMode.REPHRASE]: {
    systemPrompt: `You are an expert in rephrasing. Follow these rules strictly:
- Rephrase the text with different wording while maintaining the exact meaning
- Do not add explanations or commentary
- Preserve all formatting and line breaks
- Do not add information not present in the original text
- Return only the rephrased text`,
    userPromptTemplate: 'Rephrase the following text:\n\n{inputText}',
  },

  [AIMode.SUMMARIZE]: {
    systemPrompt: `You are an expert summarizer. Follow these rules strictly:
- Summarize the text into 3 key points
- Format as a bullet list
- Preserve key facts and numbers
- Do not add information not present in the original text
- Do not add explanations or commentary
- Return only the summary`,
    userPromptTemplate: 'Summarize the following text into 3 key points as a bullet list:\n\n{inputText}',
  },

  [AIMode.PROOFREADING]: {
    systemPrompt: `You are an expert proofreader. Follow these rules strictly:
- Fix spelling, grammar, and readability issues
- Do not change the meaning or tone
- Preserve all formatting and line breaks
- Do not add information not present in the original text
- Do not add explanations or commentary
- Return only the corrected text`,
    userPromptTemplate: 'Proofread and correct the following text:\n\n{inputText}',
  },

  [AIMode.CODE_TECHNICAL]: {
    systemPrompt: `You are an expert in technical documentation. Follow these rules strictly:
- Process technical content and code carefully
- Preserve all code blocks and syntax highlighting markers
- Keep technical terms and variable names unchanged
- Do not modify code or add explanations
- Preserve all formatting and line breaks
- Do not add information not present in the original text
- Return only the processed text`,
    userPromptTemplate: 'Process the following technical content:\n\n{inputText}',
  },
};

/**
 * 言語判定ヘルパー
 */
export function detectLanguage(text: string): Language {
  // 簡易的な言語判定（日本語の文字が含まれているかチェック）
  const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g;
  const japaneseMatches = text.match(japaneseRegex) || [];
  const japaneseRatio = japaneseMatches.length / text.length;

  if (japaneseRatio > 0.3) {
    return Language.JAPANESE;
  }
  return Language.ENGLISH;
}

/**
 * 出力言語の決定
 */
export function determineOutputLanguage(
  inputLanguage: Language,
  outputLanguageSetting: Language
): Language {
  if (outputLanguageSetting !== Language.AUTO) {
    return outputLanguageSetting;
  }

  // Auto: 入力言語が日本語なら英語、英語なら日本語
  return inputLanguage === Language.JAPANESE ? Language.ENGLISH : Language.JAPANESE;
}
