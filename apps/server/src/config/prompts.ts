import defaultSettings from './defaultSettings.json';

export const QUERY_REWRITE_SYSTEM_PROMPT = defaultSettings.systemPrompts.queryRewrite;
export const NO_ANSWER_TOKEN = defaultSettings.systemPrompts.noAnswerToken;

export const NO_ANSWER_INSTRUCTION = `\n\nInstructions:
1. Give direct, concise, and helpful answers. Never use filler, preambles, or phrases like "As an AI..." or "Based on the provided context...".
2. Use the context above when relevant. Answer directly in clean, readable text.
3. If the visitor asks general questions, broad overviews, conversational follow-ups (e.g. "tell me", "tell me now", "what do you know", "explain", "give details", "what can you do"), or asks about topics offered earlier in conversation:
   - Provide a helpful, informative overview using available context or conversation history.
   - Proactively suggest 2-3 specific topics or questions they can ask next.
4. Only respond with exactly this token and nothing else: ${NO_ANSWER_TOKEN} when the question asks for specific unknown facts, private data, or concrete figures (like unlisted personal contact details, unlisted prices, or internal policies) that are completely absent from both the context and the conversation history. Never use this token for greetings, broad questions, or conversational continuation.`;

export const HISTORY_COMPACTION_SYSTEM_PROMPT = defaultSettings.systemPrompts.historyCompaction;
export const CONTEXT_COMPACTION_SYSTEM_PROMPT = defaultSettings.systemPrompts.contextCompaction;

