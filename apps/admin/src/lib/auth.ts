const TOKEN_KEY = 'mcb_admin_token';

/**
 * Only the session token lives in the browser. Who you are and what you may do is never stored
 * client-side — it is fetched from the server (`/auth/me`) each time the app loads, so it can't
 * be edited in devtools to unlock hidden UI.
 */
export const authStore = {
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setToken(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private-browsing / storage disabled — session just won't persist across reloads */
    }
  },

  clearToken(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      // Left over from before permissions came from the server.
      localStorage.removeItem('mcb_admin_role');
    } catch {
      /* ignore */
    }
  },
};
