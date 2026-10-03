import OpenAI from 'openai';
import { apiKeyOverrides } from '../../config/apiKeyOverrides';
import { buildUserPrompt, type LlmCallOptions, type LlmProvider } from './provider';

export const openaiProvider: LlmProvider = {
  name: 'openai',
  isConfigured: () => Boolean(apiKeyOverrides.get('openai')),

  async generateAnswer(opts: LlmCallOptions): Promise<string> {
    return apiKeyOverrides.executeWithFailover('openai', async (apiKey) => {
      const client = new OpenAI({ apiKey });
      const response = await client.chat.completions.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        top_p: opts.topP,
        frequency_penalty: opts.frequencyPenalty,
        presence_penalty: opts.presencePenalty,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          ...opts.history.map((turn) => ({ role: turn.role, content: turn.content }) as const),
          { role: 'user', content: buildUserPrompt(opts.context, opts.question, opts.history.length > 0 || Boolean(opts.historySummary), opts.historySummary) },
        ],
      });
      return response.choices[0]?.message?.content ?? '';
    });
  },
};
