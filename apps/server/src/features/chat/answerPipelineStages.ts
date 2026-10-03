import type { AnswerSource, CacheSettings, ChatResponse, LlmRequestLogDTO } from '../../shared';
import { queryCacheRepo } from '../../db/queries/queryCache.queries';
import { faqService } from '../faqs/faqService';
import { questionChunksRepo } from '../../db/queries/questionChunks.queries';
import { restrictedWordsRepo } from '../../db/queries/restrictedWords.queries';
import { redisCache } from '../../cache/redis';

export type Respond = (answer: string, source: AnswerSource, llmRequest?: LlmRequestLogDTO) => Promise<ChatResponse>;

// What each lookup resolves to — taken from the repos so the types can't drift.
type FaqMatch = Awaited<ReturnType<typeof faqService.findBestMatch>>;
type SemanticHit = Awaited<ReturnType<typeof queryCacheRepo.findSimilar>>;
type ChunkMatch = Awaited<ReturnType<typeof questionChunksRepo.findBestMatch>>;


export async function tryRestrictedWords(
  messageText: string,
  enableRestrictedWords: boolean,
  respond: Respond,
): Promise<ChatResponse | null> {
  if (!enableRestrictedWords) return null;
  const match = await restrictedWordsRepo.findMatching(messageText);
  if (!match) return null;
  const llmRequest: LlmRequestLogDTO = {
    provider: 'restricted-words',
    systemPrompt: 'Restricted Words Interceptor',
    context: '',
    question: messageText,
    model: 'substring-match-filter',
    temperature: 0,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    maxTokens: 0,
    history: [],
    pipelineAudit: {
      skippedReason: `Blocked by Restricted Words rule: "${match.phrase}"`,
      stagesChecked: [{ stage: 'Stage 0: Restricted Words', status: 'hit', details: `Matched word "${match.phrase}"` }],
    },
  };
  return respond(match.response, 'restricted', llmRequest);
}

export async function tryExactCache(
  hash: string,
  skipFastPath: boolean,
  respond: Respond,
): Promise<ChatResponse | null> {
  if (skipFastPath) return null;
  const cached = await redisCache.get(hash);
  if (!cached) return null;
  const llmRequest: LlmRequestLogDTO = {
    provider: 'redis-cache',
    systemPrompt: 'Exact Redis Query Cache',
    context: '',
    question: '',
    model: 'redis-hash-cache',
    temperature: 0,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    maxTokens: 0,
    history: [],
    pipelineAudit: {
      skippedReason: 'Served from instant $0 exact query Redis cache',
      stagesChecked: [
        { stage: 'Stage 0: Restricted Words', status: 'miss' },
        { stage: 'Stage 1: Exact Cache', status: 'hit', details: 'Exact hash lookup matched' },
      ],
    },
  };
  return respond(cached, 'cache', llmRequest);
}

export async function tryFaq(
  questionText: string,
  embedding: number[],
  hash: string,
  ttlSeconds: number,
  isScoped: boolean,
  isFollowUp: boolean,
  bypassCache: boolean,
  enableFaqs: boolean,
  respond: Respond,
  prefetched?: Promise<FaqMatch | null>,
): Promise<ChatResponse | null> {
  if (!enableFaqs || isScoped || bypassCache) return null;

  const faqMatch = await (prefetched ?? faqService.findBestMatch(questionText, embedding));
  if (!faqMatch) return null;

  if (!isFollowUp) await redisCache.set(hash, faqMatch.answer, ttlSeconds);
  const llmRequest: LlmRequestLogDTO = {
    provider: 'faq-match',
    systemPrompt: `Matched FAQ: "${faqMatch.question}" (${(faqMatch.similarity * 100).toFixed(0)}% match)`,
    context: '',
    question: questionText,
    model: 'faq-database',
    temperature: 0,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    maxTokens: 0,
    history: [],
    pipelineAudit: {
      skippedReason: `Served from FAQ match: "${faqMatch.question}" (${(faqMatch.similarity * 100).toFixed(0)}% match)`,
      stagesChecked: [
        { stage: 'Stage 0: Restricted Words', status: 'miss' },
        { stage: 'Stage 1: Exact Cache', status: 'miss' },
        { stage: 'Stage 2: FAQ Search', status: 'hit', details: `Matched FAQ "${faqMatch.question}" (${(faqMatch.similarity * 100).toFixed(0)}%)` },
      ],
    },
  };
  return respond(faqMatch.answer, 'faq', llmRequest);
}

export async function trySemanticCache(
  embedding: number[],
  hash: string,
  cacheSettings: CacheSettings,
  ttlSeconds: number,
  skipFastPath: boolean,
  respond: Respond,
  prefetched?: Promise<SemanticHit | null>,
): Promise<ChatResponse | null> {
  if (skipFastPath) return null;

  const semanticHit = await (prefetched ?? queryCacheRepo.findSimilar(embedding, cacheSettings.semanticThreshold));
  if (semanticHit) {
    await queryCacheRepo.recordHit(semanticHit.id);
    await redisCache.set(hash, semanticHit.answer, ttlSeconds);
    const llmRequest: LlmRequestLogDTO = {
      provider: 'semantic-cache',
      systemPrompt: `Matched semantic query cache (${(semanticHit.similarity * 100).toFixed(0)}% similarity)`,
      context: '',
      question: '',
      model: 'vector-semantic-cache',
      temperature: 0,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      maxTokens: 0,
      history: [],
      pipelineAudit: {
        skippedReason: `Served from semantic query cache (${(semanticHit.similarity * 100).toFixed(0)}% similarity)`,
        stagesChecked: [
          { stage: 'Stage 0: Restricted Words', status: 'miss' },
          { stage: 'Stage 1: Exact Cache', status: 'miss' },
          { stage: 'Stage 2: FAQ Search', status: 'miss' },
          { stage: 'Stage 3: Question Chunks', status: 'miss' },
          { stage: 'Stage 4: Semantic Cache', status: 'hit', details: `Vector similarity hit (${(semanticHit.similarity * 100).toFixed(0)}%)` },
        ],
      },
    };
    return respond(semanticHit.answer, 'cache', llmRequest);
  }

  return null;
}

export async function tryQuestionChunk(
  questionText: string,
  embedding: number[],
  hash: string,
  ttlSeconds: number,
  isScoped: boolean,
  isFollowUp: boolean,
  bypassCache: boolean,
  enableQuestionChunksMatching: boolean,
  respond: Respond,
  prefetched?: Promise<ChunkMatch | null>,
): Promise<ChatResponse | null> {
  if (!enableQuestionChunksMatching || isScoped || bypassCache) return null;

  const match = await (prefetched ?? questionChunksRepo.findBestMatch(questionText, embedding));
  if (!match) return null;

  await questionChunksRepo.incrementUseCount(match.id);
  if (!isFollowUp) await redisCache.set(hash, match.answer, ttlSeconds);
  const llmRequest: LlmRequestLogDTO = {
    provider: 'question-chunk',
    systemPrompt: `Question Chunk match (${(match.similarity * 100).toFixed(0)}% similarity)`,
    context: '',
    question: questionText,
    model: 'pre-matched-chunk',
    temperature: 0,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    maxTokens: 0,
    history: [],
    pipelineAudit: {
      skippedReason: `Served from pre-matched Question Chunk (${(match.similarity * 100).toFixed(0)}% similarity)`,
      stagesChecked: [
        { stage: 'Stage 0: Restricted Words', status: 'miss' },
        { stage: 'Stage 1: Exact Cache', status: 'miss' },
        { stage: 'Stage 2: FAQ Search', status: 'miss' },
        { stage: 'Stage 3: Question Chunks', status: 'hit', details: `Matched question chunk (${(match.similarity * 100).toFixed(0)}%)` },
      ],
    },
  };
  return respond(match.answer, 'chunk', llmRequest);
}
