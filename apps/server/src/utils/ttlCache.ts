/**
 * A tiny cache for one value that is read on every request but changes rarely (e.g. the list of restricted words).
 * - Loads once, then serves from memory for `ttlMs`.
 * - Concurrent first requests share one load instead of each hitting the database.
 * - `invalidate()` drops the value; a load that was already in flight when you invalidated is not stored, so a
 *   stale result can't overwrite a fresh write. A failed load is not cached.
 * It lives in this process only: with several server instances, another instance sees a change after at most `ttlMs`.
 */
export function createTtlCache<T>(load: () => Promise<T>, ttlMs: number) {
  let value: T | undefined;
  let hasValue = false;
  let expiresAt = 0;
  let inflight: Promise<T> | null = null;
  let generation = 0;

  return {
    async get(): Promise<T> {
      if (hasValue && Date.now() < expiresAt) return value as T;
      if (inflight) return inflight;
      const startedIn = generation;
      const pending = load()
        .then((loaded) => {
          if (startedIn === generation) {
            value = loaded;
            hasValue = true;
            expiresAt = Date.now() + ttlMs;
          }
          return loaded;
        })
        .finally(() => {
          if (inflight === pending) inflight = null;
        });
      inflight = pending;
      return pending;
    },
    invalidate(): void {
      generation++;
      hasValue = false;
      value = undefined;
      inflight = null;
    },
  };
}
