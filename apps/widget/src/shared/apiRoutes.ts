export const API_ROUTES = {
  health: '/health',
  chat: {
    base: '/chat',
    voice: '/chat/voice',
    speak: '/chat/speak',
    history: '/chat/history',
    widgetConfig: '/chat/widget-config',
    signup: '/chat/auth/signup',
    login: '/chat/auth/login',
    me: '/chat/auth/me',
  },
} as const;
