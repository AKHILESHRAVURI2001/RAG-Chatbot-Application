import { settingsRepo } from '../../db/queries/settings.queries';
import { conversationsRepo } from '../../db/queries/conversations.queries';
import { visitorUsersRepo } from '../../db/queries/visitorUsers.queries';
import { isWithinBusinessHours } from '../../utils/businessHours';
import type { VisitorJwtPayload } from '../auth/visitorAuthService';

export interface AccessDenied {
  status: number;
  body: Record<string, unknown>;
}

// Shared by every visitor-facing chat/voice/speak endpoint: the widget must be
// turned on and it must be within business hours, or none of them should run.
export async function checkWidgetAvailability(): Promise<AccessDenied | null> {
  const [widget, businessHours] = await Promise.all([settingsRepo.getWidget(), settingsRepo.getBusinessHours()]);
  if (!widget.enabled) return { status: 503, body: { error: widget.unavailableMessage } };
  if (!isWithinBusinessHours(businessHours)) return { status: 503, body: { error: businessHours.closedMessage } };
  return null;
}

// Only the main text-chat endpoint needs this: the sign-up/login wall (with
// its optional free-question allowance) and the per-registered-user message
// cap. Voice/speak skip it — they already gate on the widget being enabled.
export async function checkLoginGateAndLimits(
  sessionId: string,
  visitor: VisitorJwtPayload | null,
): Promise<AccessDenied | null> {
  const widget = await settingsRepo.getWidget();

  if (widget.requireLogin && !visitor) {
    const freeLimit = widget.freeQuestionsBeforeAuth ?? 0;
    let allowedFree = freeLimit > 0;
    if (allowedFree) {
      const convId = await conversationsRepo.findBySession(sessionId);
      const prevCount = convId ? await conversationsRepo.countRecentUserMessages(convId, 24) : 0;
      allowedFree = prevCount < freeLimit;
    }
    if (!allowedFree) {
      return {
        status: 401,
        body: {
          error: 'login_required',
          title: widget.loginPromptTitle || 'Sign up or Log in to continue',
          message: widget.loginPromptMessage || 'Please create an account or sign in to ask questions and receive instant AI answers.',
          signupUrl: widget.signupUrl || '/signup',
          loginUrl: widget.loginUrl || '/login',
        },
      };
    }
  }

  if (visitor) {
    const limits = await settingsRepo.getLimits();
    if (limits.enabled !== false && limits.registeredUserMessageLimit && limits.registeredUserMessageLimit > 0) {
      const userRecord = await visitorUsersRepo.findById(visitor.sub);
      if (userRecord && userRecord.messageCount >= limits.registeredUserMessageLimit) {
        return {
          status: 429,
          body: {
            error:
              limits.customLimitMessage ||
              `You've reached your message limit of ${limits.registeredUserMessageLimit} questions. Please contact the site administrator to continue.`,
          },
        };
      }
    }
  }

  return null;
}
