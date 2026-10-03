import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conversationsRepo } from '../../../src/db/queries/conversations.queries';
import { exportConversationsAsText } from '../../../src/features/conversations/conversationExportService';

vi.mock('../../../src/db/queries/conversations.queries', () => ({
  conversationsRepo: { listConversationsInRange: vi.fn() },
}));

const FROM = new Date('2026-01-01T00:00:00Z');
const TO = new Date('2026-01-31T23:59:59Z');

describe('exportConversationsAsText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('says plainly when nothing happened in the given range, rather than an empty file', async () => {
    (conversationsRepo.listConversationsInRange as any).mockResolvedValue([]);
    const text = await exportConversationsAsText(FROM, TO);
    expect(text).toContain('No conversations with activity between');
  });

  it('includes every conversation with a header naming its session and start time', async () => {
    (conversationsRepo.listConversationsInRange as any).mockResolvedValue([
      {
        id: 'conv-1',
        sessionId: 'session-abc',
        createdAt: new Date('2026-01-05T10:00:00Z'),
        messages: [
          { role: 'user', content: 'Hello', answerSource: null, createdAt: new Date('2026-01-05T10:00:00Z') },
          { role: 'assistant', content: 'Hi there', answerSource: 'llm', createdAt: new Date('2026-01-05T10:00:02Z') },
        ],
      },
    ]);

    const text = await exportConversationsAsText(FROM, TO);

    expect(text).toContain('Session: session-abc');
    expect(text).toContain('Conversation ID: conv-1');
    expect(text).toContain('USER: Hello');
    expect(text).toContain('ASSISTANT (llm): Hi there');
  });

  it('labels an error turn plainly, since its content already carries the marker', async () => {
    (conversationsRepo.listConversationsInRange as any).mockResolvedValue([
      {
        id: 'conv-1',
        sessionId: 'session-abc',
        createdAt: new Date('2026-01-05T10:00:00Z'),
        messages: [{ role: 'assistant', content: '[error] The AI provider failed to respond.', answerSource: null, createdAt: new Date('2026-01-05T10:00:00Z') }],
      },
    ]);

    const text = await exportConversationsAsText(FROM, TO);

    expect(text).toContain('ASSISTANT: [error] The AI provider failed to respond.');
  });

  it('separates multiple conversations, each with its own header', async () => {
    (conversationsRepo.listConversationsInRange as any).mockResolvedValue([
      { id: 'conv-1', sessionId: 'session-a', createdAt: new Date('2026-01-05T10:00:00Z'), messages: [{ role: 'user', content: 'a', answerSource: null, createdAt: new Date('2026-01-05T10:00:00Z') }] },
      { id: 'conv-2', sessionId: 'session-b', createdAt: new Date('2026-01-06T10:00:00Z'), messages: [{ role: 'user', content: 'b', answerSource: null, createdAt: new Date('2026-01-06T10:00:00Z') }] },
    ]);

    const text = await exportConversationsAsText(FROM, TO);

    expect(text).toContain('Session: session-a');
    expect(text).toContain('Session: session-b');
    expect(text).toContain('2 conversation(s)');
  });

  it('passes the exact from/to dates through to the repo query', async () => {
    (conversationsRepo.listConversationsInRange as any).mockResolvedValue([]);
    await exportConversationsAsText(FROM, TO);
    expect(conversationsRepo.listConversationsInRange).toHaveBeenCalledWith(FROM, TO);
  });
});
