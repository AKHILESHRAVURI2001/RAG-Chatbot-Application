import { afterEach, describe, expect, it, vi } from 'vitest';
import { WidgetApiService } from '../../src/services/widgetApi';

// Single source of truth for the test origin — change it here, not in every test.
const ORIGIN = 'https://example.com';
const makeApi = (apiBase: string = ORIGIN) => new WidgetApiService({ apiBase });

describe('WidgetApiService', () => {
  describe('baseUrl', () => {
    it('appends /api to a bare origin', () => {
      expect(makeApi(ORIGIN).baseUrl).toBe(`${ORIGIN}/api`);
    });

    it('strips a trailing slash before appending /api', () => {
      expect(makeApi(`${ORIGIN}/`).baseUrl).toBe(`${ORIGIN}/api`);
    });

    it('does not double up /api when the configured base already ends with it', () => {
      expect(makeApi(`${ORIGIN}/api`).baseUrl).toBe(`${ORIGIN}/api`);
    });

    it('trims surrounding whitespace in the configured apiBase', () => {
      expect(makeApi(`  ${ORIGIN}  `).baseUrl).toBe(`${ORIGIN}/api`);
    });

    it('falls back to a bare /api when apiBase is empty', () => {
      expect(makeApi('').baseUrl).toBe('/api');
    });
  });

  describe('isApiHealthy', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns true when the health endpoint responds ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      expect(await makeApi().isApiHealthy()).toBe(true);
    });

    it('returns false when the health endpoint responds with a non-ok status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      expect(await makeApi().isApiHealthy()).toBe(false);
    });

    it('returns false (not throw) when the request itself fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      await expect(makeApi().isApiHealthy()).resolves.toBe(false);
    });
  });

  describe('fetchConfig', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns the server config when the request succeeds', async () => {
      const serverConfig = { greeting: 'Hello from server', primaryColor: '#000000' };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => serverConfig }));
      await expect(makeApi().fetchConfig()).resolves.toEqual(serverConfig);
    });

    it('falls back to sensible defaults when the request fails, instead of throwing', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      const config = await makeApi().fetchConfig();
      expect(config.enabled).toBe(true);
      expect(config.greeting).toBeTruthy();
      expect(config.quickReplies).toEqual([]);
    });

    it('falls back to defaults when the server responds with a non-ok status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
      const config = await makeApi().fetchConfig();
      expect(config.enabled).toBe(true);
    });
  });
});
