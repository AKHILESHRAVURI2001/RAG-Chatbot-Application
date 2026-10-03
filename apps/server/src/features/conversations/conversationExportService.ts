import { conversationsRepo } from '../../db/queries/conversations.queries';

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function roleLabel(role: string, answerSource: string | null): string {
  if (role !== 'assistant') return role.toUpperCase();
  return answerSource ? `ASSISTANT (${answerSource})` : 'ASSISTANT';
}

export async function exportConversationsAsText(from: Date, to: Date): Promise<string> {
  const conversations = await conversationsRepo.listConversationsInRange(from, to);

  if (conversations.length === 0) {
    return `No conversations with activity between ${formatTimestamp(from)} and ${formatTimestamp(to)}.\n`;
  }

  const sections = conversations.map((conv) => {
    const header = [`Session: ${conv.sessionId}`, `Conversation ID: ${conv.id}`, `Started: ${formatTimestamp(conv.createdAt)}`].join('\n');
    const lines = conv.messages.map((m) => `[${formatTimestamp(m.createdAt)}] ${roleLabel(m.role, m.answerSource)}: ${m.content}`);
    return `${header}\n${'-'.repeat(60)}\n${lines.join('\n')}`;
  });

  const rangeHeader = `MiniChatbotAgent — conversation export\nRange: ${formatTimestamp(from)} to ${formatTimestamp(to)}\n${conversations.length} conversation(s)\n${'='.repeat(60)}`;
  return `${rangeHeader}\n\n${sections.join('\n\n')}\n`;
}
