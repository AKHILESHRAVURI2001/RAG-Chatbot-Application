import { describe, expect, it, vi } from 'vitest';
import { isRetryableError, withRetry } from '../../src/utils/retry';

describe('isRetryableError', () => {
  it('recognizes common transient-failure signatures', () => {
    expect(isRetryableError(new Error('[503 Service Unavailable] This model is currently experiencing high demand'))).toBe(true);
    expect(isRetryableError(new Error('429 Too Many Requests'))).toBe(true);
    expect(isRetryableError(new Error('rate limit exceeded'))).toBe(true);
    expect(isRetryableError(new Error('connect ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
  });

  it('does not treat permanent failures as retryable', () => {
    expect(isRetryableError(new Error('Invalid API key'))).toBe(false);
    expect(isRetryableError(new Error('404 model not found'))).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns the result immediately on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockResolvedValueOnce('ok after retries');
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).resolves.toBe('ok after retries');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after exhausting retries on a persistently transient failure', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('503 Service Unavailable'));
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow('503 Service Unavailable');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('fails immediately on a non-transient error without retrying', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Invalid API key'));
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow('Invalid API key');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
