import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTtlCache } from '../../src/utils/ttlCache';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createTtlCache', () => {
  it('loads once and serves from memory until the ttl passes', async () => {
    const load = vi.fn(async () => 'v1');
    const cache = createTtlCache(load, 1000);
    expect(await cache.get()).toBe('v1');
    expect(await cache.get()).toBe('v1');
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1001);
    await cache.get();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares one load between concurrent first callers', async () => {
    const load = vi.fn(async () => 'v');
    const cache = createTtlCache(load, 1000);
    await Promise.all([cache.get(), cache.get(), cache.get()]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads after invalidate()', async () => {
    let n = 0;
    const cache = createTtlCache(async () => ++n, 60_000);
    expect(await cache.get()).toBe(1);
    cache.invalidate();
    expect(await cache.get()).toBe(2);
  });

  it('does not store a result that was still loading when invalidate() ran (no stale overwrite)', async () => {
    let resolveFirst!: (v: string) => void;
    const loads = [new Promise<string>((r) => (resolveFirst = r)), Promise.resolve('fresh')];
    const cache = createTtlCache(() => loads.shift()!, 60_000);
    const first = cache.get();
    cache.invalidate(); // a write happened while the first read was in flight
    resolveFirst('stale');
    await first;
    expect(await cache.get()).toBe('fresh');
  });

  it('does not cache a failed load', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce('ok');
    const cache = createTtlCache(load, 1000);
    await expect(cache.get()).rejects.toThrow('db down');
    expect(await cache.get()).toBe('ok');
  });
});
