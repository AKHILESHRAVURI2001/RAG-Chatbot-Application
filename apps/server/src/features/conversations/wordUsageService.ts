import { buildFullPromptText, WordUsageDTO } from '../../shared';
import { conversationsRepo } from '../../db/queries/conversations.queries';
import { wordCount } from '../chat/historyCompactionService';

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getWordUsage(days: number | null): Promise<WordUsageDTO> {
  const since = days && days > 0 ? new Date(Date.now() - days * 86_400_000) : null;
  const rows = await conversationsRepo.getLlmMessagesForUsage(since);

  const byDay = new Map<string, { promptWords: number; answerWords: number }>();
  const byProviderMap = new Map<string, { promptWords: number; answerWords: number; totalWords: number; requestCount: number }>();
  let totalPromptWords = 0;
  let totalAnswerWords = 0;

  for (const row of rows) {
    const promptWords = row.llmRequest?.promptWords ?? wordCount(buildFullPromptText(row.llmRequest));
    const answerWords = row.llmRequest?.answerWords ?? wordCount(row.content);
    totalPromptWords += promptWords;
    totalAnswerWords += answerWords;

    const key = dateKey(row.createdAt);
    const day = byDay.get(key) ?? { promptWords: 0, answerWords: 0 };
    day.promptWords += promptWords;
    day.answerWords += answerWords;
    byDay.set(key, day);

    const providerName = row.llmRequest?.provider || (row.llmRequest?.model ? `model: ${row.llmRequest.model}` : 'llm');
    const prov = byProviderMap.get(providerName) ?? { promptWords: 0, answerWords: 0, totalWords: 0, requestCount: 0 };
    prov.promptWords += promptWords;
    prov.answerWords += answerWords;
    prov.totalWords += (promptWords + answerWords);
    prov.requestCount += 1;
    byProviderMap.set(providerName, prov);
  }

  const daily = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, ...d }));

  const byProvider = Array.from(byProviderMap.entries())
    .map(([provider, data]) => ({ provider, ...data }))
    .sort((a, b) => b.totalWords - a.totalWords);

  return { totalPromptWords, totalAnswerWords, daily, byProvider };
}

