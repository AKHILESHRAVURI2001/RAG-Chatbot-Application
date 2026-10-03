import { conversationsRepo } from '../../db/queries/conversations.queries';
import { wordCount } from '../chat/historyCompactionService';

export interface VoiceUsageDTO {
  turnCount: number;
  totalTranscriptWords: number;
  totalAnswerWords: number;
  avgResponseTimeMs: number | null;
}

export async function getVoiceUsage(days: number | null): Promise<VoiceUsageDTO> {
  const since = days && days > 0 ? new Date(Date.now() - days * 86_400_000) : null;
  const rows = await conversationsRepo.getVoiceMessagesForUsage(since);

  let turnCount = 0;
  let totalTranscriptWords = 0;
  let totalAnswerWords = 0;
  let totalResponseMs = 0;
  let responseCount = 0;

  for (const row of rows) {
    if (row.role === 'user') {
      totalTranscriptWords += wordCount(row.content);
    } else {
      turnCount++;
      totalAnswerWords += wordCount(row.content);
      if (row.responseTimeMs != null) {
        totalResponseMs += row.responseTimeMs;
        responseCount++;
      }
    }
  }

  return {
    turnCount,
    totalTranscriptWords,
    totalAnswerWords,
    avgResponseTimeMs: responseCount > 0 ? Math.round(totalResponseMs / responseCount) : null,
  };
}
