import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai';
import { apiKeyOverrides } from '../../config/apiKeyOverrides';
import { hedged } from '../../utils/hedge';
import { buildUserPrompt, type LlmCallOptions, type LlmProvider } from './provider';

/**
 * The default is the fastest stable model. Measured with the same ~5 KB prompt: gemini-3.1-flash-lite answers in
 * ~1.2 s, gemini-3-flash-preview in ~2 s, while gemini-3.5-flash took 11–26 s (shared-capacity overload) and the 2.x
 * models are retired (404). Pick another model explicitly in the admin panel if you prefer its quality over speed.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

// Names that older settings (or the admin dropdown) may still hold: generic aliases and retired models.
const LEGACY_GEMINI_MODELS = new Set(['gemini-flash', 'gemini-pro', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro']);

function normalizeGeminiModel(modelName?: string): string {
  if (!modelName) return DEFAULT_GEMINI_MODEL;
  const clean = modelName.trim().toLowerCase().replace(/^models\//i, '').replace(/[\s_]+/g, '-');
  if (!clean || LEGACY_GEMINI_MODELS.has(clean)) return DEFAULT_GEMINI_MODEL;
  return clean; // an explicit, current model name is respected as chosen
}

function getGeminiCandidateModels(primaryModel?: string): string[] {
  // Tried in order: the chosen model, then other fast models, with the slow-but-capable one last.
  return Array.from(new Set([normalizeGeminiModel(primaryModel), DEFAULT_GEMINI_MODEL, 'gemini-3-flash-preview', 'gemini-3.5-flash']));
}

// A model that hasn't answered in this long is overloaded; failing over to the next one beats waiting.
const PER_MODEL_TIMEOUT_MS = 10_000;
// How long the first model gets before a second one is started alongside it (typical answers take ~1.5 s).
const HEDGE_MS = 2_000;

/** True when the error is about this model or the service (overloaded, retired, timed out) - a different model may succeed. */
function isModelOrServerError(err: any): boolean {
  const msg = String(err?.message || '');
  return (
    /400|404|429|500|503|not found|quota|rate limit|resourceexhausted|service unavailable|high demand|spike|internal error|not supported|unsupported|no longer available|unexpected model name|timed out/i.test(msg) ||
    [400, 404, 429, 500, 503].includes(err?.status)
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), ms);
  });
  return Promise.race([
    promise.then((res) => {
      clearTimeout(timer);
      return res;
    }),
    timeoutPromise,
  ]);
}

export const geminiProvider: LlmProvider = {
  name: 'gemini',
  isConfigured: () => Boolean(apiKeyOverrides.get('gemini')),

  async generateAnswer(opts: LlmCallOptions): Promise<string> {
    const candidateModels = getGeminiCandidateModels(opts.model);

    return apiKeyOverrides.executeWithFailover('gemini', async (apiKey) => {
      const client = new GoogleGenerativeAI(apiKey);

      // One call to one model. Gemini 2.5+/3.x "think" before answering by default; those hidden tokens count against
      // maxOutputTokens (a 600-token limit can cut the visible answer off mid-sentence) and add many seconds. For
      // retrieval-based Q&A the answer is already in the supplied context, so thinking is switched off — and if a
      // model rejects that setting, the call is repeated once without it. A rate limit gets one short retry.
      const callModel = async (modelId: string): Promise<string> => {
        let disableThinking = true;
        for (let attempt = 1; ; attempt++) {
          try {
            const model = client.getGenerativeModel({
              model: modelId,
              systemInstruction: opts.systemPrompt,
              generationConfig: {
                temperature: opts.temperature,
                maxOutputTokens: opts.maxTokens,
                topP: opts.topP,
                ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              } as GenerationConfig,
            });
            const chat = model.startChat({
              history: opts.history.map((turn) => ({
                role: turn.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: turn.content }],
              })),
            });
            const call = chat.sendMessage(
              buildUserPrompt(opts.context, opts.question, opts.history.length > 0 || Boolean(opts.historySummary), opts.historySummary),
            );
            const result = await withTimeout(call, PER_MODEL_TIMEOUT_MS, `Model ${modelId} request timed out after ${PER_MODEL_TIMEOUT_MS / 1000}s`);
            return result.response.text();
          } catch (err: any) {
            const msg = String(err?.message || '');
            if (disableThinking && /thinking/i.test(msg)) {
              disableThinking = false;
              attempt--; // not a real failed attempt — repeat without the thinking setting
              continue;
            }
            if (/429|rate limit|resourceexhausted/i.test(msg) && attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, 400));
              continue;
            }
            throw err;
          }
        }
      };

      // Hedged: if the chosen model hasn't answered in HEDGE_MS, the next model starts alongside it and the first
      // answer wins. A slow or overloaded model then costs ~HEDGE_MS instead of its whole timeout. Errors that
      // another model can't fix (a bad API key) stop the race so the key pool can fail over instead.
      return hedged(
        candidateModels.map((modelId) => () => callModel(modelId)),
        HEDGE_MS,
        (err) => !isModelOrServerError(err),
      );
    });
  },
};
