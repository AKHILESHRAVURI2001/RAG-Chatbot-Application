/** A timestamp as the browser's own locale would show it, or an em dash for "never happened yet". Shared by Chat Logs (Postgres) and Admin > Firebase (Firestore) — same display convention for both transcript views. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}
