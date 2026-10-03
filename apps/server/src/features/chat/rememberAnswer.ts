import type { LlmRequestLogDTO } from '../../shared';
import { queryCacheRepo } from '../../db/queries/queryCache.queries';
import { questionChunksRepo } from '../../db/queries/questionChunks.queries';
import { redisCache } from '../../cache/redis';
import { firebaseMirror } from '../reports/firebaseMirror';
import { stripRelatedArticles } from './promptAssembly';
import type { Turn } from './turn';

/**
 * What to keep after the AI has answered, so the same (or a similar) question is cheap next time:
 *  - the answer goes into the exact cache (Redis / memory) and the semantic cache (database), unless this turn must
 *    not be cached (follow-ups, scoped widgets);
 *  - if the admin enabled "Auto-store", it is also saved as a Question Chunk they can see and edit.
 * Everything here runs in the background — the visitor's answer never waits for it — and failures are only logged.
 */
export function rememberAnswer(turn: Turn, embedding: number[], answer: string, llmRequest: LlmRequestLogDTO): void {
  const { message, hash, ttlSeconds, skipFastPath, llm: llmSettings } = turn;

  if (!skipFastPath) {
    void Promise.all([
      queryCacheRepo.upsert(message, hash, embedding, answer, 'llm', ttlSeconds),
      redisCache.set(hash, answer, ttlSeconds),
    ])
      .then(() => firebaseMirror.mirrorCachedAnswer(hash, message, answer, ttlSeconds))
      .catch((err) => console.warn('[chatService] Background cache write failed:', err?.message ?? err));
  }

  if (llmSettings.autoStoreQuestionChunks) {
    llmRequest.autoStoredChunk = true;
    const cleanAnswer = stripRelatedArticles(answer);
    if (cleanAnswer && cleanAnswer.trim()) {
      questionChunksRepo
        .create({
          question: message,
          answer: cleanAnswer,
          embedding: embedding && embedding.length > 0 ? embedding : undefined,
          similarityThreshold: 0.85,
        })
        .catch((err) => {
          console.warn('[autoStoreQuestionChunks] Background auto-store note:', err?.message ?? err);
        });
    }
  }
}
