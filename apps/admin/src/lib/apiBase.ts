// Where the admin panel sends API calls.
// VITE_API_BASE_URL wins when set (local development). Otherwise the API is on the same address as the
// admin panel itself, under /api, so one build works on any domain.
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || `${window.location.origin}/api`;
