/**
 * Runs `starters` as a "hedged" race and returns the first one that succeeds.
 *
 * The first starter begins immediately. If it hasn't finished after `hedgeMs`, the next one is started *alongside*
 * it (not instead of it), and so on — so a single slow or overloaded backend costs about `hedgeMs` instead of its
 * whole timeout. If a starter fails, the next one begins at once. If `isFatal(error)` is true (for example a bad
 * API key, which no other backend would fix) the race stops and rejects immediately. If every starter fails, the
 * last error is thrown.
 *
 * The usual case — the first backend answers quickly — makes exactly one call, so hedging adds no cost there.
 */
export function hedged<T>(starters: ReadonlyArray<() => Promise<T>>, hedgeMs: number, isFatal: (err: unknown) => boolean = () => false): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (starters.length === 0) return reject(new Error('Nothing to run'));

    let launched = 0;
    let failed = 0;
    let settled = false;
    let lastError: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn();
    };

    const launchNext = () => {
      if (settled || launched >= starters.length) return;
      const start = starters[launched++];
      if (timer) clearTimeout(timer);
      if (launched < starters.length) timer = setTimeout(launchNext, hedgeMs);

      let pending: Promise<T>;
      try {
        pending = start();
      } catch (err) {
        pending = Promise.reject(err);
      }
      pending.then(
        (value) => settle(() => resolve(value)),
        (err) => {
          lastError = err;
          failed++;
          if (isFatal(err)) return settle(() => reject(err));
          if (failed >= starters.length) return settle(() => reject(lastError));
          launchNext(); // this one is out — bring the next in right away (no-op if everything is already running)
        },
      );
    };

    launchNext();
  });
}
