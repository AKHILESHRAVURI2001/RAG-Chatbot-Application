export interface WidgetSettings {
  companyName: string;
  adminPrimaryColor: string;
  primaryColor: string;
  icon: string;
  iconSvg: string;
  title: string;
  description: string;
  note: string;
  enabled: boolean;
  unavailableMessage: string;
  quickReplies: { label: string; message: string }[];
  proactiveEnabled: boolean;
  proactiveDelaySeconds: number;
  proactiveMessage: string;
  poweredByText: string;
  requireLogin?: boolean;
  loginPromptTitle?: string;
  loginPromptMessage?: string;
  signupUrl?: string;
  loginUrl?: string;
  freeQuestionsBeforeAuth?: number;
}

export interface PromptSettings {
  systemPrompt: string;
  greeting: string;
  noContextMessage: string;
  chunkFallbackIntroMessage?: string;
}

export type AnswerSource = 'faq' | 'cache' | 'llm' | 'no-match' | 'chunk-fallback' | 'chunk';

export interface ChatResponse {
  answer: string;
  source: AnswerSource;
  conversationId: string;
  compacted?: boolean;
}

export interface VoiceChatResponse extends ChatResponse {
  transcript: string;
  audio?: { base64: string; format: string };
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  answerSource: AnswerSource | null;
  createdAt: string;
}

export interface ChatHistoryResponse {
  conversationId: string | null;
  messages: ChatHistoryMessage[];
}
