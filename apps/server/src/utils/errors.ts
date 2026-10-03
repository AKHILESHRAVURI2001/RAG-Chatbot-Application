export class SessionLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionLimitError';
  }
}

export class SessionBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionBlockedError';
  }
}

const TECHNICAL_ERROR_PATTERN =
  /GoogleGenerativeAI|generativelanguage|googleapis|openai|anthropic|sarvam|fetch failed|404|500|502|503|504|ETIMEDOUT|ECONNREFUSED|timed out|timeout|Model .* request/i;

interface ErrorResponder {
  status(code: number): { json(body: unknown): void };
}

// Shared by every chat/voice endpoint's catch block: known session errors pass
// their message straight through, anything else gets checked against
// TECHNICAL_ERROR_PATTERN so a raw provider/network error never reaches the
// visitor — they see a generic retry message, while the real cause is logged
// server-side under `logTag`.
export function sendChatError(res: ErrorResponder, err: unknown, logTag: string): void {
  if (err instanceof SessionLimitError) {
    res.status(429).json({ error: err.message });
    return;
  }
  if (err instanceof SessionBlockedError) {
    res.status(403).json({ error: err.message });
    return;
  }
  const rawMsg = err instanceof Error ? err.message : String(err);
  const isTechnical = TECHNICAL_ERROR_PATTERN.test(rawMsg);
  const safeError = isTechnical ? 'Please try again after some time. The service is currently not available.' : rawMsg;
  if (isTechnical) console.error(`[${logTag}]`, err);
  res.status(500).json({ error: safeError });
}

/** An error the caller is meant to see, with the HTTP status it should get. Throw it from a handler/service and `errorHandler` does the rest. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
