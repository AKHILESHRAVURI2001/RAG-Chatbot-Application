export interface WidgetConfig {
  greeting: string;
  primaryColor: string;
  icon: string;
  iconSvg: string;
  title: string;
  description: string;
  note: string;
  enabled: boolean;
  unavailableMessage: string;
  quickReplies: { label: string; message: string }[];
  voiceEnabled: boolean;
  proactiveEnabled: boolean;
  proactiveDelaySeconds: number;
  proactiveMessage: string;
  poweredByText: string;
  requireLogin?: boolean;
  allowPublicSignup?: boolean;
  loginPromptTitle?: string;
  loginPromptMessage?: string;
  signupUrl?: string;
  loginUrl?: string;
  freeQuestionsBeforeAuth?: number;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  answerSource?: string | null;
  createdAt?: string;
}

export interface SendMessageResponse {
  answer: string;
  source: string;
  loginRequired?: boolean;
  loginPromptTitle?: string;
  loginPromptMessage?: string;
  signupUrl?: string;
  loginUrl?: string;
}

export interface VoiceMessageResponse {
  transcript: string;
  answer: string;
  source: string;
  audio?: {
    base64: string;
    format: string;
  };
}

export interface WidgetInitOptions {
  apiBase: string;
  documentId?: string;
  tag?: string;
  icon?: string;
  primaryColor?: string;
  title?: string;
  userId?: string;
  authToken?: string;
}
