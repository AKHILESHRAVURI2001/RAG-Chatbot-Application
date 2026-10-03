import { initializeApp, cert, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { firebaseSettingsCache } from '../../config/firebaseCredentials';
import type { LlmRequestLogDTO } from '../../shared';

export interface MirroredMessage {
  messageId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  answerSource?: string | null;
  llmRequest?: LlmRequestLogDTO | null;
  responseTimeMs?: number | null;
  channel?: 'text' | 'voice';
  createdAt: Date;
}

export interface FirestoreStats {
  conversationCount: number;
  messageCount: number | null;
  messageCountError?: string;
}

export interface DateRange {
  from?: Date;
  to?: Date;
}

export interface AnswerSourceBreakdown {
  faq: number;
  cache: number;
  llm: number;
  noMatch: number;
  chunkFallback?: number;
}

export interface FirestoreConversationSummary {
  id: string;
  sessionId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  blocked: boolean;
  hasSummary: boolean;
}

export interface FirestoreConversationPage {
  conversations: FirestoreConversationSummary[];
  nextCursor: string | null;
}

export interface FirestoreMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  answerSource: string | null;
  responseTimeMs: number | null;
  createdAt: Date | null;
  contextCompacted: boolean;
  llmRequest: LlmRequestLogDTO | null;
  channel: 'text' | 'voice';
}

class FirebaseMirrorService {
  private cachedApp: App | null = null;
  private cachedCredentialJson: string | undefined;

  private resolveServiceAccount(): Record<string, unknown> | null {
    const json = firebaseSettingsCache.getCredentialJson();
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  public isConfigured(): boolean {
    const account = this.resolveServiceAccount();
    return Boolean(account && account.project_id && account.private_key && account.client_email);
  }

  public resetApp(): void {
    const stale = this.cachedApp;
    this.cachedApp = null;
    this.cachedCredentialJson = undefined;
    if (stale) {
      void deleteApp(stale).catch(() => {});
    }
  }

  private getApp(): App | null {
    const json = firebaseSettingsCache.getCredentialJson();
    if (!json) return null;
    if (this.cachedApp && this.cachedCredentialJson === json) return this.cachedApp;

    const account = this.resolveServiceAccount();
    if (!account) return null;
    try {
      if (this.cachedApp) void deleteApp(this.cachedApp).catch(() => {});
      this.cachedApp = initializeApp({ credential: cert(account as any) }, `firebase-mirror-${Date.now()}`);
      this.cachedCredentialJson = json;
      return this.cachedApp;
    } catch (err) {
      console.warn('[firebaseMirror] Failed to initialize Firebase app:', (err as Error).message);
      return null;
    }
  }

  private getDb(): Firestore | null {
    const app = this.getApp();
    if (!app) return null;
    try {
      return getFirestore(app);
    } catch (err) {
      console.warn('[firebaseMirror] Failed to get a Firestore instance:', (err as Error).message);
      return null;
    }
  }

  public async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const db = this.getDb();
    if (!db) return { ok: false, error: 'No valid Firebase service-account credential is configured.' };
    try {
      const ref = db.collection('_health').doc('ping');
      await ref.set({ at: new Date() });
      await ref.get();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  public mirrorConversationCreated(conversationId: string, sessionId: string, createdAt: Date): void {
    if (!firebaseSettingsCache.isEnabled()) return;
    const db = this.getDb();
    if (!db) return;

    db.collection('conversations')
      .doc(conversationId)
      .set({ sessionId, blocked: false, createdAt, updatedAt: createdAt }, { merge: true })
      .catch((err) => {
        console.warn('[firebaseMirror] Failed to mirror conversation to Firestore:', (err as Error).message);
      });
  }

  public mirrorMessage(message: MirroredMessage): void {
    if (!firebaseSettingsCache.isEnabled()) return;
    const db = this.getDb();
    if (!db) return;

    const conversationRef = db.collection('conversations').doc(message.conversationId);
    conversationRef
      .set({ updatedAt: message.createdAt }, { merge: true })
      .then(() =>
        conversationRef.collection('messages').add({
          messageId: message.messageId,
          role: message.role,
          content: message.content,
          answerSource: message.answerSource ?? null,
          llmRequest: message.llmRequest ?? null,
          responseTimeMs: message.responseTimeMs ?? null,
          channel: message.channel ?? 'text',
          createdAt: message.createdAt,
        }),
      )
      .catch((err) => {
        console.warn('[firebaseMirror] Failed to mirror message to Firestore:', (err as Error).message);
      });
  }

  public mirrorConversationSummary(conversationId: string, summary: string, summaryUntil: Date): void {
    if (!firebaseSettingsCache.isEnabled()) return;
    const db = this.getDb();
    if (!db) return;

    db.collection('conversations')
      .doc(conversationId)
      .set({ summary, summaryUntil, updatedAt: new Date() }, { merge: true })
      .catch((err) => {
        console.warn('[firebaseMirror] Failed to mirror summary to Firestore:', (err as Error).message);
      });
  }

  public mirrorConversationBlocked(conversationId: string, blocked: boolean): void {
    if (!firebaseSettingsCache.isEnabled()) return;
    const db = this.getDb();
    if (!db) return;

    db.collection('conversations')
      .doc(conversationId)
      .set({ blocked, updatedAt: new Date() }, { merge: true })
      .catch((err) => {
        console.warn('[firebaseMirror] Failed to mirror status to Firestore:', (err as Error).message);
      });
  }

  public mirrorCachedAnswer(hash: string, query: string, answer: string, ttlSeconds: number): void {
    if (!firebaseSettingsCache.isEnabled()) return;
    const db = this.getDb();
    if (!db) return;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    db.collection('semantic_cache')
      .doc(hash)
      .set({ query, answer, source: 'cache', createdAt: now, expiresAt }, { merge: true })
      .catch((err) => {
        console.warn('[firebaseMirror] Failed to mirror cached answer to Firestore:', (err as Error).message);
      });
  }

  public async getCacheStats(): Promise<{ cachedQueriesCount: number } | null> {
    const db = this.getDb();
    if (!db) return null;
    try {
      const snap = await db.collection('semantic_cache').count().get();
      return { cachedQueriesCount: snap.data().count };
    } catch (err) {
      console.warn('[firebaseMirror] Failed to read cache count from Firestore:', (err as Error).message);
      return null;
    }
  }

  public async clearCacheMirror(): Promise<void> {
    if (!firebaseSettingsCache.isEnabled()) return;
    const db = this.getDb();
    if (!db) return;
    try {
      const snap = await db.collection('semantic_cache').limit(500).get();
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    } catch (err) {
      console.warn('[firebaseMirror] Failed to clear cache mirror in Firestore:', (err as Error).message);
    }
  }

  private applyDateRange(query: FirebaseFirestore.Query, range?: DateRange): FirebaseFirestore.Query {
    let q = query;
    if (range?.from) q = q.where('createdAt', '>=', range.from);
    if (range?.to) q = q.where('createdAt', '<=', range.to);
    return q;
  }

  public async getStats(range?: DateRange): Promise<FirestoreStats | null> {
    const db = this.getDb();
    if (!db) return null;

    let conversationCount: number;
    try {
      const snap = await this.applyDateRange(db.collection('conversations'), range).count().get();
      conversationCount = snap.data().count;
    } catch (err) {
      console.warn('[firebaseMirror] Failed to read conversation count from Firestore:', (err as Error).message);
      return null;
    }

    try {
      const snap = await this.applyDateRange(db.collectionGroup('messages'), range).count().get();
      return { conversationCount, messageCount: snap.data().count };
    } catch (err) {
      console.warn('[firebaseMirror] Failed to read message count from Firestore:', (err as Error).message);
      return { conversationCount, messageCount: null, messageCountError: (err as Error).message };
    }
  }

  public async getAnswerSourceBreakdown(): Promise<AnswerSourceBreakdown | { error: string } | null> {
    const db = this.getDb();
    if (!db) return null;
    try {
      const sources = ['faq', 'cache', 'llm', 'no-match', 'chunk-fallback'] as const;
      const [faq, cache, llm, noMatch, chunkFallback] = await Promise.all(
        sources.map((s) => db.collectionGroup('messages').where('answerSource', '==', s).count().get()),
      );
      return {
        faq: faq.data().count,
        cache: cache.data().count,
        llm: llm.data().count,
        noMatch: noMatch.data().count,
        chunkFallback: chunkFallback.data().count,
      };
    } catch (err) {
      console.warn('[firebaseMirror] Failed to read answer-source breakdown from Firestore:', (err as Error).message);
      return { error: (err as Error).message };
    }
  }

  public async listConversations(limitCount: number, cursor?: string, range?: DateRange): Promise<FirestoreConversationPage | null> {
    const db = this.getDb();
    if (!db) return null;
    try {
      let query = this.applyDateRange(db.collection('conversations'), range).orderBy('createdAt', 'desc').limit(limitCount);
      if (cursor) {
        const cursorDoc = await db.collection('conversations').doc(cursor).get();
        if (cursorDoc.exists) query = query.startAfter(cursorDoc);
      }
      const snap = await query.get();
      const conversations = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          sessionId: typeof d.sessionId === 'string' ? d.sessionId : '',
          createdAt: d.createdAt?.toDate?.() ?? null,
          updatedAt: d.updatedAt?.toDate?.() ?? null,
          blocked: Boolean(d.blocked),
          hasSummary: Boolean(d.summary),
        };
      });
      return { conversations, nextCursor: snap.docs.length === limitCount ? snap.docs[snap.docs.length - 1].id : null };
    } catch (err) {
      console.warn('[firebaseMirror] Failed to list conversations from Firestore:', (err as Error).message);
      return null;
    }
  }

  public async getConversationMessages(conversationId: string): Promise<FirestoreMessage[] | null> {
    const db = this.getDb();
    if (!db) return null;
    try {
      const snap = await db.collection('conversations').doc(conversationId).collection('messages').orderBy('createdAt', 'asc').get();
      return snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          role: d.role === 'user' ? 'user' : 'assistant',
          content: typeof d.content === 'string' ? d.content : '',
          answerSource: d.answerSource ?? null,
          responseTimeMs: d.responseTimeMs ?? null,
          createdAt: d.createdAt?.toDate?.() ?? null,
          contextCompacted: Boolean(d.llmRequest?.contextCompacted),
          llmRequest: d.llmRequest ?? null,
          channel: d.channel === 'voice' ? 'voice' : 'text',
        };
      });
    } catch (err) {
      console.warn('[firebaseMirror] Failed to read conversation messages from Firestore:', (err as Error).message);
      return null;
    }
  }
}

export const firebaseMirror = new FirebaseMirrorService();
