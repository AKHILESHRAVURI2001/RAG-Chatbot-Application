import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/env', () => ({ env: { FIREBASE_SERVICE_ACCOUNT_JSON: '' } }));

describe('firebaseSettingsCache', () => {
  beforeEach(() => vi.resetModules());

  it('is disabled and unconfigured before anything is set', async () => {
    const { firebaseSettingsCache } = await import('../../src/config/firebaseCredentials');
    expect(firebaseSettingsCache.isEnabled()).toBe(false);
    expect(firebaseSettingsCache.getCredentialJson()).toBeUndefined();
  });

  it('resolves the admin-set credential once set', async () => {
    const { firebaseSettingsCache } = await import('../../src/config/firebaseCredentials');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: '{"project_id":"x"}' });
    expect(firebaseSettingsCache.isEnabled()).toBe(true);
    expect(firebaseSettingsCache.getCredentialJson()).toBe('{"project_id":"x"}');
  });

  it('clearing the admin-set credential (empty string) falls back to nothing when .env has none either', async () => {
    const { firebaseSettingsCache } = await import('../../src/config/firebaseCredentials');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: '{"project_id":"x"}' });
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: '' });
    expect(firebaseSettingsCache.getCredentialJson()).toBeUndefined();
  });

  it('falls back to .env when no admin-set credential is present', async () => {
    vi.doMock('../../src/config/env', () => ({ env: { FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"from-env"}' } }));
    const { firebaseSettingsCache } = await import('../../src/config/firebaseCredentials');
    expect(firebaseSettingsCache.getCredentialJson()).toBe('{"project_id":"from-env"}');
  });

  it('prefers the admin-set credential over .env when both are present', async () => {
    vi.doMock('../../src/config/env', () => ({ env: { FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"from-env"}' } }));
    const { firebaseSettingsCache } = await import('../../src/config/firebaseCredentials');
    firebaseSettingsCache.set({ enabled: true, serviceAccountJson: '{"project_id":"from-admin"}' });
    expect(firebaseSettingsCache.getCredentialJson()).toBe('{"project_id":"from-admin"}');
  });
});
