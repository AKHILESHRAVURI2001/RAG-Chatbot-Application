import Anthropic from '@anthropic-ai/sdk';
import { apiKeyOverrides } from '../../config/apiKeyOverrides';
import { buildUserPrompt, type LlmCallOptions, type LlmProvider } from './provider';

export const anthropicProvider: LlmProvider = {
  name: 'anthropic',
  isConfigured: () => Boolean(apiKeyOverrides.get('anthropic')),

  async generateAnswer(opts: LlmCallOptions): Promise<string> {
    return apiKeyOverrides.executeWithFailover('anthropic', async (apiKey) => {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        top_p: opts.topP,
        // Anthropic has no frequency/presence-penalty equivalent — intentionally unused here.
        system: opts.systemPrompt,
        messages: [
          ...opts.history.map((turn) => ({ role: turn.role, content: turn.content }) as const),
          { role: 'user' as const, content: buildUserPrompt(opts.context, opts.question, opts.history.length > 0 || Boolean(opts.historySummary), opts.historySummary) },
        ],
      });
      const block = response.content.find((b) => b.type === 'text');
      return block && block.type === 'text' ? block.text : '';
    });
  },
};
