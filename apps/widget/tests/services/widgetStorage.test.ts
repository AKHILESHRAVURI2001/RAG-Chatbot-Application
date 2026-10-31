import { beforeEach, describe, expect, it } from 'vitest';
import { WidgetStorageService } from '../../src/services/widgetStorage';

describe('WidgetStorageService', () => {
  let storage: WidgetStorageService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    storage = new WidgetStorageService();
  });

  describe('session id', () => {
    it('generates and persists a session id on first access', () => {
      const id = storage.getSessionId();
      expect(id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(storage.getSessionId()).toBe(id);
    });

    it('newSessionId() always produces a different, persisted id', () => {
      const first = storage.getSessionId();
      const second = storage.newSessionId();
      expect(second).not.toBe(first);
      expect(storage.getSessionId()).toBe(second);
    });
  });

  describe('note dismissal (fingerprinted, not stored verbatim)', () => {
    it('is not dismissed before dismissNote() is called', () => {
      expect(storage.isNoteDismissed('Some note text')).toBe(false);
    });

    it('is dismissed for the exact same text after dismissNote()', () => {
      storage.dismissNote('Some note text');
      expect(storage.isNoteDismissed('Some note text')).toBe(true);
    });

    it('does not store the raw note text in localStorage', () => {
      const note = 'Buying a home? Ask me about offers, surveys or costs';
      storage.dismissNote(note);
      const raw = localStorage.getItem('mcb_note_dismissed');
      expect(raw).not.toBeNull();
      expect(raw).not.toBe(note);
      expect(raw!.length).toBeLessThan(note.length);
    });

    it('treats a changed note as not dismissed, so it resurfaces', () => {
      storage.dismissNote('Original note');
      expect(storage.isNoteDismissed('Original note, edited')).toBe(false);
    });

    it('clearNoteDismissal() resets the dismissed state', () => {
      storage.dismissNote('Some note text');
      storage.clearNoteDismissal();
      expect(storage.isNoteDismissed('Some note text')).toBe(false);
    });
  });

  describe('proactive callout dismissal (fingerprinted, not stored verbatim)', () => {
    it('is dismissed only for the exact message that was dismissed', () => {
      storage.dismissProactive('Hi there!');
      expect(storage.isProactiveDismissed('Hi there!')).toBe(true);
      expect(storage.isProactiveDismissed('Hi there')).toBe(false);
    });
  });

  describe('visitor auth', () => {
    it('returns null when no token/user has been set', () => {
      expect(storage.getVisitorToken()).toBeNull();
      expect(storage.getVisitorUser()).toBeNull();
    });

    it('round-trips a token and a user object', () => {
      storage.setVisitorToken('tok-123');
      storage.setVisitorUser({ id: 'u1', name: 'Alex', email: 'alex@example.com' });
      expect(storage.getVisitorToken()).toBe('tok-123');
      expect(storage.getVisitorUser()).toEqual({ id: 'u1', name: 'Alex', email: 'alex@example.com' });
    });

    it('clearVisitorToken() removes both the token and the user', () => {
      storage.setVisitorToken('tok-123');
      storage.setVisitorUser({ id: 'u1', name: 'Alex', email: 'alex@example.com' });
      storage.clearVisitorToken();
      expect(storage.getVisitorToken()).toBeNull();
      expect(storage.getVisitorUser()).toBeNull();
    });
  });

  describe('widget open state (sessionStorage, not localStorage)', () => {
    it('defaults to closed', () => {
      expect(storage.isWidgetOpen()).toBe(false);
    });

    it('persists open/closed via sessionStorage specifically', () => {
      storage.setWidgetOpen(true);
      expect(storage.isWidgetOpen()).toBe(true);
      expect(sessionStorage.getItem('mcb_widget_open')).toBe('1');
      expect(localStorage.getItem('mcb_widget_open')).toBeNull();

      storage.setWidgetOpen(false);
      expect(storage.isWidgetOpen()).toBe(false);
      expect(sessionStorage.getItem('mcb_widget_open')).toBeNull();
    });
  });

  describe('sound preference', () => {
    it('defaults to enabled', () => {
      expect(storage.isSoundEnabled()).toBe(true);
    });

    it('persists the disabled state and can be re-enabled', () => {
      storage.setSoundEnabled(false);
      expect(storage.isSoundEnabled()).toBe(false);
      storage.setSoundEnabled(true);
      expect(storage.isSoundEnabled()).toBe(true);
    });
  });

  describe('mic icon preference', () => {
    it('defaults to enabled', () => {
      expect(storage.isMicEnabled()).toBe(true);
    });

    it('persists the disabled state and can be re-enabled', () => {
      storage.setMicEnabled(false);
      expect(storage.isMicEnabled()).toBe(false);
      storage.setMicEnabled(true);
      expect(storage.isMicEnabled()).toBe(true);
    });
  });
});
