import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hedged } from '../../src/utils/hedge';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const later = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const laterFail = (ms: number, msg: string) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms));

describe('hedged', () => {
  it('makes only one call when the first answers before the hedge delay', async () => {
    const second = vi.fn(() => later(10, 'second'));
    const p = hedged([() => later(500, 'first'), second], 2500);
    await vi.advanceTimersByTimeAsync(600);
    expect(await p).toBe('first');
    expect(second).not.toHaveBeenCalled();
  });

  it('starts the next alongside a slow first and returns whichever answers first', async () => {
    const p = hedged([() => later(20_000, 'slow'), () => later(1_000, 'fast')], 2500);
    await vi.advanceTimersByTimeAsync(2500 + 1000 + 10);
    expect(await p).toBe('fast');
  });

  it('still takes the first one if it finishes after the hedge started but before the second', async () => {
    const p = hedged([() => later(3_000, 'first'), () => later(5_000, 'second')], 2500);
    await vi.advanceTimersByTimeAsync(3_010);
    expect(await p).toBe('first');
  });

  it('starts the next immediately when one fails', async () => {
    const second = vi.fn(() => later(100, 'second'));
    const p = hedged([() => laterFail(50, 'boom'), second], 2500);
    await vi.advanceTimersByTimeAsync(200);
    expect(second).toHaveBeenCalledTimes(1);
    expect(await p).toBe('second');
  });

  it('rejects with the last error when every starter fails', async () => {
    const p = hedged([() => laterFail(10, 'a'), () => laterFail(10, 'b')], 2500);
    const assertion = expect(p).rejects.toThrow('b');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('stops at once on a fatal error and never starts the rest', async () => {
    const second = vi.fn(() => later(10, 'second'));
    const p = hedged([() => laterFail(10, 'bad key'), second], 2500, (e) => String((e as Error).message).includes('bad key'));
    const assertion = expect(p).rejects.toThrow('bad key');
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(second).not.toHaveBeenCalled();
  });

  it('treats a starter that throws synchronously as a failure', async () => {
    const p = hedged(
      [
        () => {
          throw new Error('sync');
        },
        () => later(10, 'ok'),
      ],
      2500,
    );
    await vi.advanceTimersByTimeAsync(50);
    expect(await p).toBe('ok');
  });
});
