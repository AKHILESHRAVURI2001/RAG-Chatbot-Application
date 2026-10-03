import type { ChatResponse } from '../../shared';
import { embedText } from '../../providers/embedding/resolve';
import { queryCacheRepo } from '../../db/queries/queryCache.queries';
import { questionChunksRepo } from '../../db/queries/questionChunks.queries';
import { faqService } from '../faqs/faqService';
import { normalizeQuestion } from '../../utils/hash';
import { tryExactCache, tryFaq, tryQuestionChunk, trySemanticCache, tryRestrictedWords } from './answerPipelineStages';
import { documentsRepo } from '../../db/queries/documents.queries';
import type { Turn } from './turn';

/**
 * The cheap ways to answer, in priority order. The first one that answers wins and the AI is never called.
 *
 * To add a stage (or reorder them), add or move one entry below — nothing else needs to change:
 *  - INSTANT_STAGES need nothing but the message, so they are checked one at a time, cheapest first.
 *  - LOOKUP_STAGES compare the question's meaning (they need its embedding). Their lookups all start together,
 *    because each is several database calls, and the results are then used in this order.
 */
interface InstantStage {
  name: string;
  run(turn: Turn): Promise<ChatResponse | null>;
}

interface LookupStage<T = unknown> {
  name: string;
  /** Begin the lookup; return undefined when this stage doesn't apply to this turn, so nothing is fetched needlessly. */
  start(turn: Turn, embedding: number[]): Promise<T> | undefined;
  /** Turn the lookup's result into a response, or null to fall through to the next stage. */
  answer(turn: Turn, embedding: number[], lookup: Promise<T> | undefined): Promise<ChatResponse | null>;
}

const usesFaqsOrChunks = (t: Turn) => !t.isScoped && !t.options.bypassCache;

const restrictedWords: InstantStage = {
  name: 'Restricted Words',
  run: (t) => tryRestrictedWords(t.message, t.llm.enableRestrictedWords !== false, t.respond),
};

const exactCache: InstantStage = {
  name: 'Exact cache',
  run: (t) => tryExactCache(t.hash, t.skipFastPath, t.respond),
};

const GREETING = /^(hi|hello|hey|good\s+morning|good\s+evening|good\s+afternoon|howdy|hola)$/i;
const greeting: InstantStage = {
  name: 'Greeting',
  async run(t) {
    const isPureGreeting = GREETING.test(t.message.replace(/[^a-zA-Z\s]/g, '').trim());
    if (!isPureGreeting || t.isFollowUp || t.isScoped) return null;
    return t.respond(t.prompt.greeting || 'Hello! How can I help you today?', 'cache');
  },
};

const faqs: LookupStage<Awaited<ReturnType<typeof faqService.findBestMatch>>> = {
  name: 'FAQs',
  start: (t, e) => (t.llm.enableFaqs !== false && usesFaqsOrChunks(t) ? faqService.findBestMatch(t.message, e) : undefined),
  answer: (t, e, lookup) =>
    tryFaq(t.message, e, t.hash, t.ttlSeconds, t.isScoped, t.isFollowUp, Boolean(t.options.bypassCache), t.llm.enableFaqs !== false, t.respond, lookup),
};

const questionChunks: LookupStage<Awaited<ReturnType<typeof questionChunksRepo.findBestMatch>>> = {
  name: 'Question Chunks',
  start: (t, e) => (t.llm.enableQuestionChunksMatching !== false && usesFaqsOrChunks(t) ? questionChunksRepo.findBestMatch(t.message, e) : undefined),
  answer: (t, e, lookup) =>
    tryQuestionChunk(t.message, e, t.hash, t.ttlSeconds, t.isScoped, t.isFollowUp, Boolean(t.options.bypassCache), t.llm.enableQuestionChunksMatching !== false, t.respond, lookup),
};

const semanticCache: LookupStage<Awaited<ReturnType<typeof queryCacheRepo.findSimilar>>> = {
  name: 'Semantic cache',
  start: (t, e) => (t.skipFastPath ? undefined : queryCacheRepo.findSimilar(e, t.cache.semanticThreshold)),
  answer: (t, e, lookup) => trySemanticCache(e, t.hash, t.cache, t.ttlSeconds, t.skipFastPath, t.respond, lookup),
};

const INSTANT_STAGES: InstantStage[] = [restrictedWords, exactCache, greeting];
const LOOKUP_STAGES: LookupStage<any>[] = [faqs, questionChunks, semanticCache];

export interface FastPathResult {
  /** The answer, if a cheap stage had one; null means the AI has to be asked. */
  response: ChatResponse | null;
  /** The question's embedding (empty when an instant stage answered first), reused by the later stages. */
  embedding: number[];
  /**
   * The content search, already running (started alongside the cheap lookups) when this is a first question — the
   * one case where the text to search is known up front. Saves a full database round trip when the AI is needed.
   */
  contentSearch?: ReturnType<typeof documentsRepo.searchSimilarChunks>;
}

export async function tryFastPath(turn: Turn): Promise<FastPathResult> {
  for (const stage of INSTANT_STAGES) {
    const response = await stage.run(turn);
    if (response) return { response, embedding: [] };
  }

  const embedding = await embedText(normalizeQuestion(turn.message) || turn.message);

  // Start every lookup now so they run side by side; the priority order below decides which answer wins.
  const lookups = LOOKUP_STAGES.map((stage) => stage.start(turn, embedding));
  // A first question is searched as typed (follow-ups get rewritten first), so its content search can start now too.
  const contentSearch =
    turn.llm.enableDocumentSearch !== false && !turn.isFollowUp
      ? documentsRepo.searchSimilarChunks(embedding, 5, turn.options.documentId, turn.options.tag, turn.message)
      : undefined;
  // If an earlier stage answers, a later lookup that fails must not become an unhandled rejection.
  for (const lookup of [...lookups, contentSearch]) lookup?.catch(() => {});

  for (let i = 0; i < LOOKUP_STAGES.length; i++) {
    const response = await LOOKUP_STAGES[i].answer(turn, embedding, lookups[i]);
    if (response) return { response, embedding };
  }
  return { response: null, embedding, contentSearch };
}
