import { env } from './env';

let override = { enabled: false, serviceAccountJson: '' };

export const firebaseSettingsCache = {
  set(value: { enabled: boolean; serviceAccountJson: string }): void {
    override = { enabled: value.enabled, serviceAccountJson: value.serviceAccountJson.trim() };
  },

  isEnabled(): boolean {
    return override.enabled;
  },

  getCredentialJson(): string | undefined {
    return override.serviceAccountJson || env.FIREBASE_SERVICE_ACCOUNT_JSON || undefined;
  },
};
