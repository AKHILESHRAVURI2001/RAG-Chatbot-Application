import type { ChatResponse } from '../../shared';
import { startTurn, type AnswerOptions } from './turn';
import { tryFastPath } from './fastPath';
import { retrieveKnowledge } from './knowledgeRetrieval';
import { generateAnswer } from './answerGeneration';

/**
 * Answers one visitor message. The work is split into steps that each live in their own file, so changing one
 * (say, how the AI is called) doesn't mean reading or risking the others:
 *
 *   turn.ts                 load the settings, refuse blocked / over-limit visitors
 *   fastPath.ts             the cheap ways to answer — blocked words, caches, FAQs, question chunks
 *   knowledgeRetrieval.ts   search your content (folding long chats, rewriting follow-ups)
 *   answerGeneration.ts     ask the AI, tidy the answer, remember it for next time
 *   noAnswer.ts             what to do when the AI can't or shouldn't answer
 */
export async function answerQuestion(sessionId: string, rawMessage: string, options: AnswerOptions = {}): Promise<ChatResponse> {
  const turn = await startTurn(sessionId, rawMessage, options);

  const fast = await tryFastPath(turn);
  if (fast.response) return fast.response;

  const knowledge = await retrieveKnowledge(turn, fast.embedding, fast.contentSearch);
  return generateAnswer(turn, knowledge, fast.embedding);
}
