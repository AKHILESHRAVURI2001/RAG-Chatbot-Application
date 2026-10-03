import type { LimitsSettings } from '../../shared';
import { conversationsRepo } from '../../db/queries/conversations.queries';
import { SessionLimitError } from '../../utils/errors';

/**
 * Message limits per visitor session: a burst limit (too many in one minute) and a rolling-window limit. Going over
 * either pauses the session for a while and refuses the message.
 */
export async function enforceSessionQuota(
  conversationId: string,
  message: string,
  limits: LimitsSettings,
  skipQuota: boolean,
): Promise<void> {
  if (skipQuota || limits.enabled === false) return;

  const windowHours = limits.sessionMessageWindowHours || 24;
  const maxLimit = limits.sessionMessageLimit || 20;

  // Both counts are independent reads, so they run together (one database round trip instead of two).
  const checkBurst = Boolean(limits.burstLimitPerMinute && limits.burstLimitPerMinute > 0);
  const [burstCount, recentMessageCount] = await Promise.all([
    checkBurst ? conversationsRepo.countRecentUserMessages(conversationId, 1 / 60) : Promise.resolve(0),
    conversationsRepo.countRecentUserMessages(conversationId, windowHours),
  ]);

  // Check burst limit per minute to stop rapid automated spam
  if (checkBurst && limits.burstLimitPerMinute) {
    if (burstCount >= limits.burstLimitPerMinute) {
      const burstPauseMins = limits.autoBlockMinutes ?? 5;
      if (burstPauseMins > 0) {
        await conversationsRepo.setBlocked(conversationId, true, burstPauseMins, 'burst_rate_limit');
      }
      const burstMessage = limits.customLimitMessage || 'You are sending messages too quickly. Please wait a moment before trying again.';
      throw new SessionLimitError(burstMessage);
    }
  }

  if (recentMessageCount < maxLimit) return;

  const durationMinutes = limits.autoBlockMinutes ?? Math.max(15, windowHours * 60);
  if (durationMinutes > 0) {
    await conversationsRepo.setBlocked(conversationId, true, durationMinutes, 'rate_limit');
  }

  const limitMessage =
    limits.customLimitMessage ||
    `You've reached the limit of ${maxLimit} messages every ${windowHours} hours. Please try again later.`;
  await conversationsRepo.addMessage(conversationId, 'user', message);
  await conversationsRepo.addMessage(conversationId, 'assistant', `[error] ${limitMessage}`);
  throw new SessionLimitError(limitMessage);
}
